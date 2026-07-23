import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "AI Intelligence — Admin", robots: { index: false, follow: false } }

export default async function AIAdminPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/ai")

  const supabase = createServiceClient()

  const [aiCount, queuePending, queueFailed, statsRes, jobsCount] = await Promise.all([
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status","pending"),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status","failed"),
    supabase.from("ai_processing_stats").select("*").order("date", { ascending: false }).limit(7),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true),
  ])

  const { data: confidenceDist } = await supabase
    .from("job_ai_intelligence")
    .select("overall_confidence")

  const dist = { high: 0, medium: 0, low: 0 }
  for (const r of (confidenceDist as any) || []) {
    const c = r.overall_confidence || 0
    if (c >= 70) dist.high++
    else if (c >= 40) dist.medium++
    else dist.low++
  }

  const coverage = jobsCount.count ? Math.round(((aiCount.count || 0) / jobsCount.count) * 100) : 0

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">AI Job Intelligence — Foundation</h1>
        <p className="mt-2 text-sm text-muted-foreground">Evidence-based, no fabrication. Runs async after ingestion. Raw job stays untouched, AI stored separately.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Coverage</p>
            <p className="mt-2 text-2xl font-semibold">{coverage}%</p>
            <p className="mt-1 text-[11px] text-zinc-500">{aiCount.count || 0} / {jobsCount.count || 0} jobs enriched</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Queue Pending</p>
            <p className="mt-2 text-2xl font-semibold">{queuePending.count || 0}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Failed: {queueFailed.count || 0}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Confidence Dist</p>
            <p className="mt-2 text-[12px]">High ≥70: {dist.high} • Med 40-69: {dist.medium} • Low &lt;40: {dist.low}</p>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-wider text-green-300">Cost (est)</p>
            <p className="mt-2 text-2xl font-semibold">$0.00</p>
            <p className="mt-1 text-[11px] text-zinc-500">Rule-based foundation, no LLM cost yet</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Intelligence Fields (Every job must have evidence)</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 text-[12px]">
            <div className="rounded-lg border border-zinc-800 bg-black p-3">
              <p className="font-medium">Africa eligibility + Country restrictions + Visa</p>
              <p className="text-zinc-500 mt-1">Explicit/likely/restricted/unknown, confidence 0-100, evidence quote, source URLs, last verified</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black p-3">
              <p className="font-medium">Remote eligibility + Timezone requirements</p>
              <p className="text-zinc-500 mt-1">fully_remote/hybrid/onsite/unknown, timezone evidence</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black p-3">
              <p className="font-medium">Salary truthfulness + Experience level + Required skills</p>
              <p className="text-zinc-500 mt-1">Disclosed vs estimated (only when labeled + evidence), min/max/currency/period, transparency indicator</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black p-3">
              <p className="font-medium">Company legitimacy + Job quality + Application difficulty + Hiring urgency</p>
              <p className="text-zinc-500 mt-1">Verified/likely_legit/unknown/suspicious, high/medium/low, with evidence</p>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-[12px] text-zinc-400">
          <p className="font-medium text-white">How AI pipeline works (foundation, extensible):</p>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            <li>After every successful ingestion, jobs are enqueued into ai_processing_queue with priority (new jobs high, refresh low)</li>
            <li>Async worker processAIQueue(batch=10) runs with rate limiting 100ms between calls, caching 24h, retry max 3 attempts, exponential backoff</li>
            <li>Each job: fetch actual job page + company page as evidence (not guessing), use rule-based + future LLM to extract, return unknown if evidence missing</li>
            <li>Store in job_ai_intelligence separate from jobs table, so raw job untouched, structured object for future search/filtering/matching</li>
            <li>Monitoring: ai_processing_stats daily total/processed/failed/avg_confidence/cost_cents, admin page shows coverage, confidence distribution, failures</li>
            <li>Design: more agents can be added later without changing ingestion engine — just add new file in lib/ai/agents/ and register in engine.ts</li>
          </ul>
        </div>
      </div>
    </SiteShell>
  )
}
