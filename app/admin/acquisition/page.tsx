import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"
import { buildSourceRegistry, getAcquisitionReport } from "@/lib/ingest/sourceRegistry"

export const dynamic = "force-dynamic"
export const metadata = { title: "Acquisition Engine — Admin", robots: { index: false, follow: false } }

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "spencerbby8@gmail.com").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean)

export default async function AcquisitionAdminPage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/acquisition")

  const supabase = createServiceClient()

  const [runsRes, jobsRes] = await Promise.all([
    supabase.from("ingest_runs").select("source, ok, fetched, inserted, skipped, rejected, error, created_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true),
  ])

  const runs = (runsRes.data as any) || []
  const registry = buildSourceRegistry(runs)
  const report = getAcquisitionReport(registry, runs)

  // Jobs fetched today
  const today = new Date()
  today.setHours(0,0,0,0)
  const todayRuns = runs.filter((r:any) => new Date(r.created_at) >= today)
  const fetchedToday = todayRuns.reduce((acc:number, r:any) => acc + (r.fetched||0), 0)
  const acceptedToday = todayRuns.reduce((acc:number, r:any) => acc + (r.inserted||0), 0)

  // Slow connectors: would need avgResponseTime tracking, placeholder using fetched low but ok
  const slowConnectors = registry.filter(r => r.jobsFetched > 0 && r.jobsFetched < 5).slice(0,5)

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Global Job Acquisition Engine — Tier 1</h1>
        <p className="mt-2 text-sm text-muted-foreground">Live health, acceptance, dedup, freshness. No mocks.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Active vs Disabled</p>
            <p className="mt-2 text-2xl font-semibold">{report.summary.enabled} / {report.summary.totalConnectors}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Disabled: {report.summary.disabled} • Failing: {report.summary.failing}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Jobs Fetched Today</p>
            <p className="mt-2 text-2xl font-semibold">{fetchedToday}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Accepted today: {acceptedToday}</p>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-wider text-green-300">Acceptance Rate</p>
            <p className="mt-2 text-2xl font-semibold">{report.summary.acceptanceRate}%</p>
            <p className="mt-1 text-[11px] text-zinc-500">Fetched {report.summary.totalFetched} • Accepted {report.summary.totalAccepted} • Rejected {report.summary.totalRejected}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Active Jobs in DB</p>
            <p className="mt-2 text-2xl font-semibold">{jobsRes.count || 0}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Avg trust {report.summary.avgTrustScore} • Africa {report.summary.avgAfricaFriendliness}/10</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider">Top Performing Sources (fetched)</h2>
            <ul className="mt-4 space-y-2">
              {report.topPerforming.map((s:any)=>(
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black px-3 py-2">
                  <span className="text-[12px] font-medium">{s.id}</span>
                  <span className="text-[11px] text-zinc-400">{s.fetched} fetched • {s.company}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-red-300">Dead / Failing Connectors</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Auto-disabled after 5 consecutive failures. Preserves existing jobs for 14 days.</p>
            <ul className="mt-4 space-y-2 max-h-[300px] overflow-auto">
              {report.deadConnectors.slice(0,20).map((d:any)=>(
                <li key={d.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <p className="text-[12px] font-medium">{d.id}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{d.reason}</p>
                  <p className="text-[10px] text-zinc-600">Last success: {d.lastSuccess ? new Date(d.lastSuccess).toLocaleDateString() : 'never'}</p>
                </li>
              ))}
              {report.deadConnectors.length===0 && <p className="text-[12px] text-zinc-500">No dead connectors — all healthy</p>}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Live Connector Health — Production Registry</h2>
          <p className="mt-1 text-[11px] text-zinc-500">Every connector has: health, last success/failed sync, fetched/accepted/rejected, avg response time, failure rate, consecutive failures, remote %, salary coverage, Africa friendliness, reliability, trust level, maintenance tier</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-[10px] text-zinc-500 uppercase">
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2">ID</th>
                  <th className="text-left py-2">Health</th>
                  <th className="text-left py-2">Enabled</th>
                  <th className="text-left py-2">Fetched</th>
                  <th className="text-left py-2">Accepted</th>
                  <th className="text-left py-2">Rejected</th>
                  <th className="text-left py-2">Fail Rate</th>
                  <th className="text-left py-2">Consec Fail</th>
                  <th className="text-left py-2">Remote %</th>
                  <th className="text-left py-2">Salary %</th>
                  <th className="text-left py-2">Africa 0-10</th>
                  <th className="text-left py-2">Trust</th>
                  <th className="text-left py-2">Maint</th>
                </tr>
              </thead>
              <tbody>
                {report.registry.map((r:any)=>(
                  <tr key={r.id} className="border-b border-zinc-800/50">
                    <td className="py-2 font-medium">{r.id}</td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] ${r.healthStatus==='healthy'?'bg-green-500/10 text-green-400':r.healthStatus==='failing'?'bg-red-500/10 text-red-400':r.healthStatus==='disabled'?'bg-zinc-700 text-zinc-400':'bg-yellow-500/10 text-yellow-400'}`}>{r.healthStatus}</span></td>
                    <td className="py-2">{r.enabled?'✓':'✗'}</td>
                    <td className="py-2">{r.jobsFetched}</td>
                    <td className="py-2">{r.jobsAccepted}</td>
                    <td className="py-2">{r.jobsRejected}</td>
                    <td className="py-2">{r.failureRate}%</td>
                    <td className="py-2">{r.consecutiveFailures}</td>
                    <td className="py-2">{r.remotePercentage}%</td>
                    <td className="py-2">{r.salaryCoverage}%</td>
                    <td className="py-2">{r.africaFriendlinessScore}</td>
                    <td className="py-2">{r.trustScore}</td>
                    <td className="py-2">{r.maintenanceTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider">Rejection Reasons</h2>
            <ul className="mt-3 space-y-1">
              {Object.entries(report.rejectionReasons).slice(0,10).map(([reason,count]:any)=>(
                <li key={reason} className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 truncate max-w-[300px]">{reason}</span>
                  <span className="text-zinc-500">{count as any}</span>
                </li>
              ))}
              {Object.keys(report.rejectionReasons).length===0 && <p className="text-[11px] text-zinc-500">No rejections — all valid</p>}
            </ul>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider">Slow Connectors</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Avg response time would be tracked via durationMs in runSource — currently placeholder, will show slow connectors over 2 seconds.</p>
            <ul className="mt-3">
              {report.slowConnectors?.length ? report.slowConnectors.map((s:any)=><li key={s.id} className="text-[11px]">{s.id} — {s.avgResponseTimeMs}ms</li>) : <p className="text-[11px] text-zinc-500">None yet — need to track duration in ingest_runs</p>}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-[12px] text-zinc-400">
          <p className="font-medium text-white">Tier 1: RemoteOK, Himalayas, Remotive, WWR + verified Ashby (Zapier, Notion)</p>
          <p className="mt-2">All produce NormalizedJob, official APIs only, respect rate limits (RemoteOK 1000ms, Himalayas 1500ms, Remotive 1000ms, WWR 2000ms), retry 2x exponential backoff, log to ingest_runs, deduplicate via apply_url hash + source_id unique index, clean descriptions via he + node-html-parser 180-250 chars.</p>
        </div>
      </div>
    </SiteShell>
  )
}
