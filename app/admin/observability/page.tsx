import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Observability — Admin", robots: { index: false, follow: false } }

/**
 * Internal observability dashboard (auth-protected via /admin middleware +
 * the in-page redirect below). Read-only view over live production state:
 * queue health, AI latency/usage/failures, coverage, admission rejects, cron
 * history, ingestion health, failed/stale jobs, AI costs.
 * All numbers come straight from the database — nothing fabricated.
 */
export default async function ObservabilityPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/observability")

  const sb = createServiceClient()

  const [
    queueRes, providerAnalytics, providerLogRecent, orchHealth,
    coverageRes, jaiRes, ingestRuns, sourceHealth, costStats, rejectsRes, failedRes, stalePageRes, stuckRes,
  ] = await Promise.all([
    sb.from("ai_processing_queue").select("status", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("ai_processing_queue").select("status", { count: "exact", head: true }).eq("status", "completed"),
    sb.from("ai_processing_queue").select("status", { count: "exact", head: true }).eq("status", "failed"),
    sb.from("ai_provider_analytics").select("*").order("total_calls", { ascending: false }),
    sb.from("ai_provider_log").select("provider, event, duration_ms, created_at").order("created_at", { ascending: false }).limit(200),
    sb.from("ai_orch_health").select("*").order("provider"),
    sb.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true),
    // [PHASE-2] Canonical verified contract: quality_score >= 40 (lib/ai/verified.ts).
    sb.from("job_ai_intelligence").select("id", { count: "exact", head: true }).like("model_version", "%:%").not("model_version", "like", "regex%").gte("quality_score", 40),
    sb.from("ingest_runs").select("source, ok, fetched, inserted, rejected, created_at").order("created_at", { ascending: false }).limit(20),
    sb.from("source_health_summary").select("*"),
    sb.from("ai_processing_stats").select("*").order("date", { ascending: false }).limit(14),
    sb.from("ai_processing_queue").select("job_id, error").eq("status", "completed").like("error", "Rejected%").limit(1000),
    sb.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    sb.from("job_ai_intelligence").select("job_id").in("page_status", [403, 404, 410]).limit(1000),
    sb.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "processing"),
  ])

  const queue = {
    pending: queueRes.count ?? 0,
    completed: queueRes.count ?? 0,
    failed: failedRes.count ?? 0,
    processing: stuckRes.count ?? 0,
  }
  const totalActive = coverageRes.count ?? 0
  const verifiedActive = jaiRes.count ?? 0
  const coveragePct = totalActive ? Math.round((verifiedActive / totalActive) * 100) : 0

  const recentLogs = (providerLogRecent.data || []) as any[]
  const latencyByProvider = new Map<string, { calls: number; okMs: number; ok: number; fail: number }>()
  for (const l of recentLogs) {
    const p = l.provider || "unknown"
    const e = latencyByProvider.get(p) || { calls: 0, okMs: 0, ok: 0, fail: 0 }
    e.calls++
    if (l.event === "success") { e.ok++; e.okMs += l.duration_ms || 0 }
    if (l.event === "failure") e.fail++
    latencyByProvider.set(p, e)
  }

  const rejects = (rejectsRes.data || []) as any[]
  const rejectReasons = new Map<string, number>()
  for (const r of rejects) {
    const reason = String(r.error || "unknown").slice(0, 40)
    rejectReasons.set(reason, (rejectReasons.get(reason) || 0) + 1)
  }

  const ingestRecent = (ingestRuns.data || []) as any[]
  const ingestOk = ingestRecent.filter((r: any) => r.ok).length
  const ingestTotal = ingestRecent.length

  const stalePages = (stalePageRes.data || []).length
  const costRows = (costStats.data || []) as any[]
  const costTracked = costRows.length > 0

  const srcHealth = (sourceHealth.data || []) as any[]

  return (
    <SiteShell>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Observability</h1>
        <p className="mt-1 text-sm text-muted-foreground">Internal read-only view over live production state.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Queue pending", queue.pending],
            ["Queue failed", queue.failed],
            ["Queue processing (stuck check)", queue.processing],
            ["Queue completed", queue.completed],
            ["Active jobs", totalActive],
            ["Verified (AI) active", verifiedActive],
            ["Coverage", `${coveragePct}%`],
            ["Pages dead (403/404/410)", stalePages],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border/60 bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Provider health (ai_orch_health)</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground">
              <tr><th className="p-2">provider</th><th className="p-2">consecutive failures</th><th className="p-2">quota exhausted</th><th className="p-2">cooldown</th><th className="p-2">successes</th><th className="p-2">failures</th><th className="p-2">last error</th></tr>
            </thead>
            <tbody>
              {((orchHealth.data || []) as any[]).map((h: any) => (
                <tr key={h.provider} className="border-b border-border/40">
                  <td className="p-2 font-medium">{h.provider}</td>
                  <td className="p-2">{h.consecutive_failures ?? 0}</td>
                  <td className="p-2">{h.is_quota_exhausted ? "yes" : "no"}</td>
                  <td className="p-2">{h.cooldown_until ? "yes" : "no"}</td>
                  <td className="p-2">{h.total_successes ?? 0}</td>
                  <td className="p-2">{h.total_failures ?? 0}</td>
                  <td className="p-2 max-w-[240px] truncate text-muted-foreground">{h.last_error_message ? String(h.last_error_message).slice(0, 80) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent AI calls (last 200 logs, by provider)</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground">
              <tr><th className="p-2">provider</th><th className="p-2">calls</th><th className="p-2">success</th><th className="p-2">failure</th><th className="p-2">avg success latency (ms)</th></tr>
            </thead>
            <tbody>
              {Array.from(latencyByProvider.entries()).sort((a, b) => b[1].calls - a[1].calls).map(([p, e]) => (
                <tr key={p} className="border-b border-border/40">
                  <td className="p-2 font-medium">{p}</td>
                  <td className="p-2">{e.calls}</td>
                  <td className="p-2 text-green-600 dark:text-green-400">{e.ok}</td>
                  <td className="p-2 text-red-600 dark:text-red-400">{e.fail}</td>
                  <td className="p-2">{e.ok > 0 ? Math.round(e.okMs / e.ok) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Admission rejects (completed + Rejected, up to 1,000)</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground">
              <tr><th className="p-2">reason prefix</th><th className="p-2">count</th></tr>
            </thead>
            <tbody>
              {Array.from(rejectReasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, c]) => (
                <tr key={r} className="border-b border-border/40"><td className="p-2">{r}</td><td className="p-2">{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cron / ingestion history (last 20 runs)</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground">
              <tr><th className="p-2">time (UTC)</th><th className="p-2">source</th><th className="p-2">ok</th><th className="p-2">fetched</th><th className="p-2">inserted</th><th className="p-2">rejected</th></tr>
            </thead>
            <tbody>
              {ingestRecent.slice(0, 12).map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="p-2">{r.created_at ? new Date(r.created_at).toISOString().slice(0, 19) : "—"}</td>
                  <td className="p-2">{r.source}</td>
                  <td className="p-2">{r.ok ? "yes" : "no"}</td>
                  <td className="p-2">{r.fetched ?? 0}</td>
                  <td className="p-2">{r.inserted ?? 0}</td>
                  <td className="p-2">{r.rejected ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-[11px] text-muted-foreground">Recent ingest success: {ingestOk}/{ingestTotal} runs.</p>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ingestion health by source</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground">
              <tr><th className="p-2">source</th><th className="p-2">runs</th><th className="p-2">ok</th><th className="p-2">fail</th><th className="p-2">consecutive</th><th className="p-2">avg fetched</th></tr>
            </thead>
            <tbody>
              {srcHealth.slice(0, 15).map((h: any) => (
                <tr key={h.source} className="border-b border-border/40">
                  <td className="p-2 font-medium">{h.source}</td>
                  <td className="p-2">{h.total_runs ?? 0}</td>
                  <td className="p-2">{h.successful_runs ?? 0}</td>
                  <td className="p-2 text-red-600 dark:text-red-400">{h.failed_runs ?? 0}</td>
                  <td className="p-2">{h.consecutive_failures ?? 0}</td>
                  <td className="p-2">{h.avg_fetched ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI costs</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {costTracked
            ? `Daily stats tracked (latest ${costRows.length} days).`
            : "Not tracked — ai_processing_stats has no rows. Cost accounting is not implemented; nothing is claimed."}
        </p>
      </main>
    </SiteShell>
  )
}
