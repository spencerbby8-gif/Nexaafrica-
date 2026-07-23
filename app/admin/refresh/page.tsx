import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"
import { calculateSourceHealth } from "@/lib/ingest/sourceHealth"

export const dynamic = "force-dynamic"
export const metadata = { title: "Refresh Admin — Nexa", robots: { index: false, follow: false } }

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "spencerbby8@gmail.com").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean)

export default async function RefreshAdminPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/refresh")

  const supabase = createServiceClient()

  const [runsRes, activeCount, staleCount, allCount] = await Promise.all([
    supabase.from("ingest_runs").select("source, ok, fetched, inserted, skipped, rejected, error, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).lt("posted_at", new Date(Date.now()-60*24*60*60*1000).toISOString()),
    supabase.from("jobs").select("id", { count: "exact", head: true }),
  ])

  const health = calculateSourceHealth((runsRes.data as any) || [])
  const failing = health.filter(h=>!h.isHealthy)

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Job Refresh Engine — Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">Live freshness, source health, cron observability. No silent failures.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Active Jobs</p>
            <p className="mt-2 text-2xl font-semibold">{activeCount.count || 0}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Total Jobs (incl inactive)</p>
            <p className="mt-2 text-2xl font-semibold">{allCount.count || 0}</p>
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-wider text-yellow-300">Stale &gt;60d posted_at</p>
            <p className="mt-2 text-2xl font-semibold">{staleCount.count || 0}</p>
          </div>
          <div className={`rounded-xl border p-4 ${failing.length>0 ? "border-red-500/20 bg-red-500/[0.05]" : "border-green-500/20 bg-green-500/[0.05]"}`}>
            <p className="text-[11px] uppercase tracking-wider">Failing Sources</p>
            <p className="mt-2 text-2xl font-semibold">{failing.length} / {health.length}</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Source Health (last 500 runs)</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Green = healthy (ok && &lt;3 consecutive failures), avgFetched, lastSuccessAt, lastError. Dead sources removed 2026-07-23 (29 disabled).</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-zinc-500 uppercase">
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2">Source</th>
                  <th className="text-left py-2">Healthy</th>
                  <th className="text-left py-2">Last Fetched</th>
                  <th className="text-left py-2">Avg</th>
                  <th className="text-left py-2">Failures</th>
                  <th className="text-left py-2">Last Run</th>
                  <th className="text-left py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {health.map((h:any)=>(
                  <tr key={h.source} className="border-b border-zinc-800/50">
                    <td className="py-2 font-medium">{h.source}</td>
                    <td className="py-2">{h.isHealthy ? <span className="text-green-400">✓</span> : <span className="text-red-400">✗ {h.consecutiveFailures}</span>}</td>
                    <td className="py-2">{h.lastFetched}</td>
                    <td className="py-2">{h.avgFetched}</td>
                    <td className="py-2">{h.consecutiveFailures}</td>
                    <td className="py-2 text-zinc-500">{h.lastRunAt ? new Date(h.lastRunAt).toLocaleString() : "-"}</td>
                    <td className="py-2 text-red-300 max-w-[200px] truncate">{h.lastError?.slice(0,80) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-[12px] text-zinc-400">
          <p className="font-medium text-white">How refresh works now (fixed):</p>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            <li>Cron 4am: /api/ingest/run with x-vercel-cron header, concurrency 4, retry 2x exponential backoff, batch existing lookup to avoid N+1</li>
            <li>Upsert: last_seen_at=now(), refresh_count++, first_seen_at preserved, trust_score recalculated with company count</li>
            <li>Cron 6am: /api/jobs/deactivate-stale uses posted_at (real date) + last_seen_at + expires_at via RPC deactivate_stale_jobs()</li>
            <li>Sitemap: filters stale &gt;90d posted_at, orders by posted_at, company latestJobAt = posted_at</li>
            <li>Counts: getFreshnessPulse, seo-status now use posted_at not created_at</li>
            <li>Dead sources disabled: 29 removed (Andela, Shopify, Deel, etc 404), 22 healthy remain fetching ~3600 jobs/run</li>
          </ul>
        </div>
      </div>
    </SiteShell>
  )
}
