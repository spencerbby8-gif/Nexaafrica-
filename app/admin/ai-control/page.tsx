import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"
import { getAllProviderHealth } from "@/lib/ai/providers/manager"
import { AI_REGISTRY } from "@/lib/ai/registry/registry"

export const dynamic = "force-dynamic"
export const metadata = { title: "AI Control Plane — Admin", robots: { index: false, follow: false } }

export default async function AIControlPlanePage() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/ai-control")

  const supabase = createServiceClient()

  const [queueRes, aiCount, reportsRes, trustAuditRes] = await Promise.all([
    supabase.from("ai_processing_queue").select("status, count").order("status"),
    supabase.from("job_ai_intelligence").select("id", { count: "exact", head: true }),
    supabase.from("job_reports").select("id, reason, status, created_at, jobs!inner(title, company)").eq("status","pending").limit(10),
    supabase.from("trust_audit_log").select("id, action, reason, created_at").order("created_at", { ascending: false }).limit(20),
  ])

  // Get queue stats
  const { data: queueStats } = await supabase.from("ai_processing_queue").select("status")
  const queueByStatus: Record<string, number> = {}
  for (const r of (queueStats as any) || []) {
    const s = (r as any).status
    queueByStatus[s] = (queueByStatus[s] || 0) + 1
  }

  const providerHealth = getAllProviderHealth()
  const registry = AI_REGISTRY

  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">AI Control Plane — Core</h1>
        <p className="mt-2 text-sm text-muted-foreground">One Gateway for every AI request. Multiple models cooperate. Evidence-based, no guessing, async only.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">AI Coverage</p>
            <p className="mt-2 text-2xl font-semibold">{aiCount.count || 0} enriched</p>
            <p className="mt-1 text-[11px] text-zinc-500">Queue pending: {queueByStatus['pending'] || 0} • Failed: {queueByStatus['failed'] || 0}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Providers Healthy</p>
            <p className="mt-2 text-2xl font-semibold">{providerHealth.filter(p=>p.isHealthy).length} / {providerHealth.length}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Fallback ready: {providerHealth.filter(p=>!p.isHealthy).length} failing</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Agents Registered</p>
            <p className="mt-2 text-2xl font-semibold">{registry.length}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Observers {registry.filter(r=>r.category==='observer').length} • Verifiers {registry.filter(r=>r.category==='verifier').length} • Council {registry.filter(r=>r.category==='council').length}</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Provider Health, Fallbacks, Cost Tracking</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-[10px] text-zinc-500 uppercase">
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2">Provider</th>
                  <th className="text-left py-2">Model</th>
                  <th className="text-left py-2">Healthy</th>
                  <th className="text-left py-2">Fail Rate</th>
                  <th className="text-left py-2">Consec Fail</th>
                  <th className="text-left py-2">Avg Latency</th>
                  <th className="text-left py-2">Total Req</th>
                  <th className="text-left py-2">Last Success</th>
                  <th className="text-left py-2">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {providerHealth.map((p:any)=>(
                  <tr key={p.id} className="border-b border-zinc-800/50">
                    <td className="py-2 font-medium">{p.id}</td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] ${p.isHealthy?'bg-green-500/10 text-green-400':'bg-red-500/10 text-red-400'}`}>{p.isHealthy?'healthy':'failing'}</span></td>
                    <td className="py-2">{p.failureRate}%</td>
                    <td className="py-2">{p.consecutiveFailures}</td>
                    <td className="py-2">{p.avgLatencyMs ? `${p.avgLatencyMs}ms` : '-'}</td>
                    <td className="py-2">{p.totalRequests}</td>
                    <td className="py-2 text-zinc-500">{p.lastSuccessAt ? new Date(p.lastSuccessAt).toLocaleString() : '-'}</td>
                    <td className="py-2 text-red-300 truncate max-w-[150px]">{p.lastError?.slice(0,60) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider">AI Registry — Future Features Only Require Adding Agents</h2>
            <ul className="mt-3 space-y-2 max-h-[400px] overflow-auto">
              {registry.map((a:any)=>(
                <li key={a.id} className="rounded-lg border border-zinc-800 bg-black p-3">
                  <p className="text-[11px] font-medium">{a.id} • <span className="text-zinc-500">{a.category}</span></p>
                  <p className="text-[11px] text-zinc-400 mt-1">{a.description.slice(0,100)}...</p>
                  <p className="text-[10px] text-zinc-600 mt-1">Models: {a.models.join(', ')} • Triggers: {a.triggers.join(', ')} • Rate: {a.rateLimitPerSec}/sec</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider">Actions, Appeals, Confidence, Model Disagreements</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-black p-3">
                <p className="text-[11px] font-medium">Policy Engine Actions</p>
                <p className="text-[11px] text-zinc-500 mt-1">allow, warn, hide, soft_lock, limit, queue_for_review, suspend — no permanent suspension without review</p>
                <p className="text-[10px] text-zinc-600 mt-2">Example: trust 20 + 5 reports → queue_for_review, hidden until human review, appeal at /contact?subject=appeal</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black p-3">
                <p className="text-[11px] font-medium">Council Disagreements</p>
                <p className="text-[11px] text-zinc-500 mt-1">When 2 models disagree, third resolves, stores consensus + disagreements. Used for profile transformation (2-3 models) and fraud detection.</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black p-3">
                <p className="text-[11px] font-medium">Appeals</p>
                <p className="text-[11px] text-zinc-500 mt-1">Every action has nextSteps + appealPath. User sees clear explanation, not silent suspension. Human review path for high impact.</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black p-3">
                <p className="text-[11px] font-medium">Audit Log</p>
                <p className="text-[11px] text-zinc-500 mt-1">Every decision: decision, confidence, provider, model, evidence, timestamp, reason, jobId, stored in trust_audit_log, traceable.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Recent Reports & Actions (Pending Review)</h2>
          <ul className="mt-3 space-y-2">
            {(reportsRes.data || []).slice(0,5).map((r:any)=>(
              <li key={r.id} className="rounded-lg border border-zinc-800 bg-black p-3 flex justify-between">
                <div>
                  <p className="text-[12px] font-medium">{r.jobs?.title} • {r.jobs?.company}</p>
                  <p className="text-[11px] text-zinc-500 capitalize">{r.reason} • {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">{r.status}</span>
              </li>
            ))}
            {(!reportsRes.data || reportsRes.data.length===0) && <p className="text-[11px] text-zinc-500">No pending reports</p>}
          </ul>
        </div>

        <div className="mt-8 rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-[12px] text-zinc-400">
          <p className="font-medium text-white">Control Plane Core — Async, Evidence-Based, No Guessing</p>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            <li>AI Gateway: single entry point for all AI requests, automatic routing, retries, fallback, health checks, cost tracking</li>
            <li>Provider Manager: 6 providers (Cerebras, Gemini, Gemini Backup, Groq, OpenRouter, HuggingFace), chooses healthiest, fails over</li>
            <li>AI Council: 2-3 models collaborate, one answers, one reviews, one resolves disagreements, stores consensus + disagreements</li>
            <li>AI Registry: single place where every agent registered, future features only require adding new agents</li>
            <li>Policy Engine: allow/warn/hide/soft_lock/limit/review/suspend, no permanent suspension without evidence and review</li>
            <li>Audit Log: decision, confidence, provider, model, evidence, timestamp, reason, traceable</li>
            <li>Admin: provider health, queue, fallback events, model disagreements, actions, appeals, confidence — Android friendly, backend driven, evidence based, no silent suspensions</li>
          </ul>
        </div>
      </div>
    </SiteShell>
  )
}
