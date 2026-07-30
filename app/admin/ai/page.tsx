import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"
import { getProofStats } from "@/lib/queries"

export const dynamic = "force-dynamic"
export const metadata = { title: "AI Intelligence — Admin", robots: { index: false, follow: false } }

export default async function AIAdminPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/ai")

  const supabase = createServiceClient()
  const proofStats = await getProofStats()

  const [
    aiCount,
    queuePending,
    queueFailed,
    queueProcessing,
    queueCompleted,
    queueTotal,
    jobsCount,
    jobsWithSalary,
    aiSalaryDisclosed,
    aiSalaryUndisclosed,
    aiAfricaExplicit,
    aiAfricaLikely,
    aiAfricaUnknown,
    aiAfricaRestricted,
    aiRemoteFull,
    aiRemoteUnknown,
    aiCompanyVerified,
    aiCompanyUnknown,
    aiExpUnknown,
    jobsRawHtml,
  ] = await Promise.all([
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).not("salary_range", "is", null),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("salary_transparency", "disclosed"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("salary_transparency", "undisclosed"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("africa_eligibility", "explicit"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("africa_eligibility", "likely"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("africa_eligibility", "unknown"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("africa_eligibility", "restricted"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("remote_eligibility", "fully_remote"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("remote_eligibility", "unknown"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("company_legitimacy", "verified"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("company_legitimacy", "unknown"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).eq("experience_level", "unknown"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).ilike("description_md", "%&lt;div%"),
  ])

  const { data: confidenceDist } = await supabase.from("job_ai_intelligence").select("overall_confidence")

  const dist = { high: 0, medium: 0, low: 0 }
  for (const r of (confidenceDist as any) || []) {
    const c = r.overall_confidence || 0
    if (c >= 70) dist.high++
    else if (c >= 40) dist.medium++
    else dist.low++
  }

  const coverage = jobsCount.count ? Math.round(((aiCount.count || 0) / jobsCount.count) * 100) : 0
  const queueCoverage = queueTotal.count ? Math.round(((queueCompleted.count || 0) / queueTotal.count) * 100) : 0

  let providerHealth: any[] = []
  try {
    const { getAllProviderHealth } = await import("@/lib/ai/providers/manager")
    providerHealth = getAllProviderHealth()
  } catch {}

  const { data: recentJobs } = await supabase.from("jobs").select("id").eq("is_active", true).order("posted_at", { ascending: false }).limit(20)
  const recentIds = (recentJobs || []).map((j: any) => j.id)
  let recentWithAI = 0
  if (recentIds.length > 0) {
    const { count } = await supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }).in("job_id", recentIds)
    recentWithAI = count || 0
  }
  const recentCoverage = recentIds.length ? Math.round((recentWithAI / recentIds.length) * 100) : 0

  const checks = {
    queuePopulating: (queueTotal.count || 0) >= (jobsCount.count || 0) * 0.9,
    aiCoverage: coverage >= 80,
    salaryRendering: (jobsWithSalary.count || 0) === 0 || (aiSalaryDisclosed.count || 0) >= (jobsWithSalary.count || 0) * 0.8,
    noRawHtml: (jobsRawHtml.count || 0) === 0,
    recentOk: recentCoverage >= 80,
    noFailed: (queueFailed.count || 0) === 0,
    providerHealthy: providerHealth.some((p: any) => p.isHealthy),
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">AI Job Intelligence — Production Health</h1>
        <p className="mt-2 text-sm text-muted-foreground">Queue → Gateway → Verifiers → job_ai_intelligence → Query → UI. Evidence-based, no fabrication. 100% coverage target.</p>

        {/* P7: Live Proof Layer stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-green-400">AI-Verified</p>
            <p className="mt-1 text-xl font-semibold">{proofStats.verified}</p>
            <p className="text-[11px] text-muted-foreground">{proofStats.aiCoveragePct}% coverage</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-amber-400">Queue Depth</p>
            <p className="mt-1 text-xl font-semibold">{proofStats.queueDepth}</p>
            <p className="text-[11px] text-muted-foreground">pending verification</p>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-blue-400">Rule-Based</p>
            <p className="mt-1 text-xl font-semibold">{proofStats.stale}</p>
            <p className="text-[11px] text-muted-foreground">needs re-verification</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active Total</p>
            <p className="mt-1 text-xl font-semibold">{proofStats.totalActive}</p>
            <p className="text-[11px] text-muted-foreground">live roles</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">AI Coverage</p>
            <p className="mt-2 text-2xl font-semibold">{coverage}%</p>
            <p className="mt-1 text-[11px] text-zinc-500">{aiCount.count || 0} / {jobsCount.count || 0} jobs enriched</p>
            <p className={`mt-2 text-[11px] ${checks.aiCoverage ? 'text-green-400' : 'text-amber-400'}`}>{checks.aiCoverage ? '✓ High' : '⚠ Low coverage'}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Queue</p>
            <p className="mt-2 text-2xl font-semibold">{queuePending.count || 0} pending</p>
            <p className="mt-1 text-[11px] text-zinc-500">Completed {queueCompleted.count || 0} / {queueTotal.count || 0} ({queueCoverage}%) • Failed {queueFailed.count || 0} • Processing {queueProcessing.count || 0}</p>
            <p className={`mt-2 text-[11px] ${checks.queuePopulating ? 'text-green-400' : 'text-red-400'}`}>{checks.queuePopulating ? '✓ Populating' : '✗ Not populating'}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Salary Truthfulness</p>
            <p className="mt-2 text-2xl font-semibold">{aiSalaryDisclosed.count || 0} disclosed</p>
            <p className="mt-1 text-[11px] text-zinc-500">Jobs with salary_range {jobsWithSalary.count || 0} • Undisclosed {aiSalaryUndisclosed.count || 0} • Raw HTML leak {jobsRawHtml.count || 0}</p>
            <p className={`mt-2 text-[11px] ${checks.salaryRendering ? 'text-green-400' : 'text-amber-400'}`}>{checks.noRawHtml ? '✓ No raw HTML' : '✗ Raw HTML leak'} • {checks.salaryRendering ? '✓ Salary mapped' : '⚠ Salary mismatch'}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Rendering Coverage</p>
            <p className="mt-2 text-2xl font-semibold">{recentCoverage}% recent</p>
            <p className="mt-1 text-[11px] text-zinc-500">{recentWithAI} / {recentIds.length} recent jobs have AI • High conf {dist.high} • Med {dist.medium} • Low {dist.low}</p>
            <p className={`mt-2 text-[11px] ${checks.recentOk ? 'text-green-400' : 'text-amber-400'}`}>{checks.recentOk ? '✓ Recent OK' : '⚠ Recent low'}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Africa Eligibility</p>
            <p className="mt-2 text-[12px] text-zinc-300">Explicit {aiAfricaExplicit.count || 0} • Likely {aiAfricaLikely.count || 0} • Restricted {aiAfricaRestricted.count || 0} • Unknown {aiAfricaUnknown.count || 0}</p>
            <p className="mt-2 text-[11px] text-zinc-500">Explicit should grow as verifiers improve. Likely dominates for remote.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Remote Policy</p>
            <p className="mt-2 text-[12px] text-zinc-300">Fully remote {aiRemoteFull.count || 0} • Unknown {aiRemoteUnknown.count || 0}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Company & Experience</p>
            <p className="mt-2 text-[12px] text-zinc-300">Verified {aiCompanyVerified.count || 0} • Unknown company {aiCompanyUnknown.count || 0} • Unknown exp {aiExpUnknown.count || 0}</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Provider Health (in-memory, resets on cold start)</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {providerHealth.length === 0 ? <p className="text-[11px] text-zinc-500">No health data – gateway not yet called in this instance</p> : providerHealth.map((p: any) => (
              <div key={p.id} className={`rounded-lg border p-2 text-[11px] ${p.isHealthy ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                <p className="font-medium text-white">{p.id} {p.isHealthy ? '✓' : '✗'} {p.enabled ? '' : '(disabled)'}</p>
                <p className="text-zinc-500">Success {p.totalRequests - p.failedRequests}/{p.totalRequests} • Fail {p.failedRequests} • Rate {p.failureRate}% • Consecutive fails {p.consecutiveFailures}</p>
                {p.lastError && <p className="mt-1 text-[10px] text-red-400 truncate">{p.lastError}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">{checks.providerHealthy ? '✓ At least one provider healthy' : '⚠ No healthy provider – fallback to rule-based'}</p>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Production Checks</h2>
          <ul className="mt-3 grid gap-1.5 text-[12px]">
            <li className={checks.queuePopulating ? 'text-green-400' : 'text-red-400'}>{checks.queuePopulating ? '✓' : '✗'} Queue populating: queueTotal ({queueTotal.count}) ≥ jobs × 0.9 ({jobsCount.count})</li>
            <li className={checks.aiCoverage ? 'text-green-400' : 'text-amber-400'}>{checks.aiCoverage ? '✓' : '⚠'} AI coverage ≥80%: {coverage}%</li>
            <li className={checks.salaryRendering ? 'text-green-400' : 'text-amber-400'}>{checks.salaryRendering ? '✓' : '⚠'} Salary mapped: jobs with salary_range {jobsWithSalary.count} vs AI disclosed {aiSalaryDisclosed.count}</li>
            <li className={checks.noRawHtml ? 'text-green-400' : 'text-red-400'}>{checks.noRawHtml ? '✓' : '✗'} No raw HTML leak: {jobsRawHtml.count} jobs with div pattern</li>
            <li className={checks.recentOk ? 'text-green-400' : 'text-amber-400'}>{checks.recentOk ? '✓' : '⚠'} Recent rendering: {recentCoverage}% of last 20 jobs have AI</li>
            <li className={checks.noFailed ? 'text-green-400' : 'text-red-400'}>{checks.noFailed ? '✓' : '✗'} No failed queue: {queueFailed.count} failed</li>
            <li className={checks.providerHealthy ? 'text-green-400' : 'text-amber-400'}>{checks.providerHealthy ? '✓' : '⚠'} Provider health: {providerHealth.filter((p:any)=>p.isHealthy).length}/{providerHealth.length} healthy</li>
          </ul>
        </div>

        <div className="mt-8 rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-[12px] text-zinc-400">
          <p className="font-medium text-white">Pipeline: queue → AI process → gateway → verifiers → job_ai_intelligence → query → card → detail</p>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            <li>Queue: enqueued on upsert in lib/ingest/run.ts with priority 10 for new, 0 for refresh, unique job_id</li>
            <li>AI process cron: vercel.json 0 5 * * * and 0 17 * * * batch 150, route /api/ai/process?batch=150 resets stuck &gt;5min</li>
            <li>Gateway: lib/ai/gateway.ts tries gemini → backup → groq → cerebras → openrouter → huggingface, caches 24h, records health, fallback chain</li>
            <li>Verifiers: realAfricaEligibilityAI, realSalaryAI etc fetch job page + cleanDescription, call gateway, return JSON with confidence + evidence, fallback to rule-based if gateway fails (model_version rule-based)</li>
            <li>Write: job_ai_intelligence upsert onConflict job_id, with all fields: africa, remote, salary (min/max/currency/period/transparency), company, experience, skills</li>
            <li>Query: lib/ai/queries.ts getAIIntelligenceForJobs uses anon + service fallback (RLS public read), returns Map, enrichJobsWithAI</li>
            <li>UI: job-card and job-detail-layout read same cleaned path, OpportunityIntelligence components fallback to job fields when AI unknown, never blank, never raw HTML/markdown</li>
          </ul>
        </div>
      </div>
    </SiteShell>
  )
}
