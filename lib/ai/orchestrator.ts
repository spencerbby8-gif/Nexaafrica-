/**
 * AI Orchestrator — DB-persisted health-aware provider routing.
 *
 * Health state persists across Vercel cold starts via the ai_provider_log
 * and ai_orch_health tables. On init, warm from DB. Provider failures
 * trigger cooldowns; probes detect recovery automatically.
 */

import { PROVIDERS, type ProviderId, type ProviderConfig } from "./providers/types"
import { callProvider as rawCallProvider, type GatewayResult, type AIRequest, type AIResponse, type ProviderCallDiag } from "./gateway"

interface ProviderState {
  id: ProviderId; consecutiveFailures: number; lastFailureAt: number; lastSuccessAt: number
  lastProbeAt: number; cooldownUntil: number; lastErrorCode: string; lastErrorMessage: string
  avgLatencyMs: number; totalRequests: number; totalFailures: number
  isQuotaExhausted: boolean; quotaResetAt: number; isRateLimited: boolean
}

const stateMap = new Map<ProviderId, ProviderState>()
let healthWarmed = false

function getState(id: ProviderId): ProviderState {
  if (!stateMap.has(id)) {
    stateMap.set(id, {
      id, consecutiveFailures: 0, lastFailureAt: 0, lastSuccessAt: 0,
      lastProbeAt: 0, cooldownUntil: 0, lastErrorCode: "", lastErrorMessage: "",
      avgLatencyMs: 0, totalRequests: 0, totalFailures: 0,
      isQuotaExhausted: false, quotaResetAt: 0, isRateLimited: false,
    })
  }
  return stateMap.get(id)!
}

function classifyError(errMsg: string): { isQuota: boolean; isRateLimit: boolean; isAuth: boolean; isNotFound: boolean; retryAfterMs: number } {
  const msg = (errMsg || "").toLowerCase()
  const quota = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota exceeded") || msg.includes("exceeded your current quota")
  const rate = msg.includes("rate_limit") || msg.includes("rate limit reached") || msg.includes("tokens per day") || msg.includes("requests per minute limit exceeded") || msg.includes("too_many_requests_error")
  const auth = msg.includes("401") || msg.includes("403") || msg.includes("invalid api key") || msg.includes("unauthorized")
  const nf = msg.includes("404") || msg.includes("model does not exist") || msg.includes("no endpoints found")
  let retryAfterMs = 0
  const m = msg.match(/retry in (\d+(?:\.\d+)?)s/); if (m) retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000)
  const mm = msg.match(/(\d+)m(\d+(?:\.\d+)?)s/); if (mm) retryAfterMs = (parseInt(mm[1]) * 60 + parseFloat(mm[2])) * 1000
  if (quota && retryAfterMs === 0) retryAfterMs = 60_000
  if (rate && retryAfterMs === 0) retryAfterMs = 120_000
  return { isQuota: quota, isRateLimit: rate, isAuth: auth, isNotFound: nf, retryAfterMs }
}

async function persistHealth(id: ProviderId) {
  try {
    const s = getState(id)
    const { createServiceClient } = await import("@/lib/supabase/service")
    const supabase = createServiceClient()
    const upsertData: any = {
      provider: id, updated_at: new Date().toISOString(),
      consecutive_failures: s.consecutiveFailures,
      last_failure_at: s.lastFailureAt ? new Date(s.lastFailureAt).toISOString() : null,
      last_success_at: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
      cooldown_until: s.cooldownUntil ? new Date(s.cooldownUntil).toISOString() : null,
      last_error_code: s.lastErrorCode || null,
      last_error_message: s.lastErrorMessage?.slice(0,300) || null,
      avg_latency_ms: s.avgLatencyMs || null,
      is_quota_exhausted: s.isQuotaExhausted,
      quota_reset_at: s.quotaResetAt ? new Date(s.quotaResetAt).toISOString() : null,
      is_rate_limited: s.isRateLimited,
      total_successes: s.totalRequests - s.totalFailures,
      total_failures: s.totalFailures,
    }
    await supabase.from("ai_orch_health").upsert(upsertData, { onConflict: "provider" })
  } catch {}
}

async function warmHealthFromDB() {
  if (healthWarmed) return
  try {
    const { createServiceClient } = await import("@/lib/supabase/service")
    const supabase = createServiceClient()
    const { data } = await supabase.from("ai_orch_health").select("*")
    if (data) {
      for (const row of data as any[]) {
        const s = getState(row.provider as ProviderId)
        s.consecutiveFailures = row.consecutive_failures || 0
        s.lastFailureAt = row.last_failure_at ? new Date(row.last_failure_at).getTime() : 0
        s.lastSuccessAt = row.last_success_at ? new Date(row.last_success_at).getTime() : 0
        s.cooldownUntil = row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0
        s.lastErrorCode = row.last_error_code || ""
        s.lastErrorMessage = row.last_error_message || ""
        s.avgLatencyMs = row.avg_latency_ms || 0
        s.isQuotaExhausted = row.is_quota_exhausted || false
        s.quotaResetAt = row.quota_reset_at ? new Date(row.quota_reset_at).getTime() : 0
        s.isRateLimited = row.is_rate_limited || false
      }
    }
  } catch {}
  healthWarmed = true
}

async function probeProvider(cfg: ProviderConfig): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const apiKey = process.env[cfg.envKey]; if (!apiKey) return { ok: false, latencyMs: 0, error: `No ${cfg.envKey}` }
  const start = Date.now()
  try {
    if (cfg.id.startsWith("gemini")) {
      const { GoogleGenAI } = await import("@google/genai")
      await new GoogleGenAI({ apiKey }).models.generateContent({
        model: cfg.model, contents: [{ role: "user", parts: [{ text: "ok" }] }], config: { temperature: 0, maxOutputTokens: 5 },
      })
      return { ok: true, latencyMs: Date.now() - start }
    }
    if (["groq","cerebras","openrouter"].includes(cfg.id)) {
      const urls: Record<string,string> = { groq: "https://api.groq.com/openai/v1/chat/completions", cerebras: "https://api.cerebras.ai/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions" }
      const body: any = { model: cfg.model, messages: [{ role: "user", content: "ok" }], temperature: 0, max_tokens: 5 }
      if (cfg.id === "openrouter") body.provider = { order: ["deepinfra"], allow_fallbacks: false }
      const res = await fetch(urls[cfg.id], { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` }, body: JSON.stringify(body) })
      if (!res.ok) { const errText = await res.text(); return { ok: false, latencyMs: Date.now() - start, error: errText.slice(0, 300) } }
      return { ok: true, latencyMs: Date.now() - start }
    }
    return { ok: false, latencyMs: 0, error: `${cfg.id} not probeable` }
  } catch (e: any) { return { ok: false, latencyMs: Date.now() - start, error: e?.message || String(e) } }
}

export async function selectProvider(): Promise<ProviderConfig | null> {
  await warmHealthFromDB()
  const now = Date.now()
  const enabled = PROVIDERS.filter(p => p.enabled)
  if (!enabled.length) return null
  const scored = enabled.map(cfg => {
    const s = getState(cfg.id)
    const inCooldown = now < s.cooldownUntil
    const quotaOk = !s.isQuotaExhausted || now > s.quotaResetAt
    const usable = !inCooldown && quotaOk
    const latencyPenalty = s.avgLatencyMs > 0 ? s.avgLatencyMs / 100 : 0
    const failurePenalty = s.consecutiveFailures * 10
    const priorityBonus = (10 - cfg.priority) * 5
    const score = usable ? priorityBonus - latencyPenalty - failurePenalty : -9999
    return { cfg, score, usable }
  })
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best && best.usable) return best.cfg
  return null
}

export function recordOrchSuccess(id: ProviderId, latencyMs: number) {
  const s = getState(id)
  s.consecutiveFailures = 0; s.lastSuccessAt = Date.now(); s.totalRequests++
  s.avgLatencyMs = s.avgLatencyMs > 0 ? Math.round(s.avgLatencyMs * 0.7 + latencyMs * 0.3) : latencyMs
  s.isQuotaExhausted = false; s.isRateLimited = false; s.cooldownUntil = 0
  persistHealth(id)

}

export function recordOrchFailure(id: ProviderId, errMsg: string) {
  const s = getState(id)
  const c = classifyError(errMsg)
  s.consecutiveFailures++; s.lastFailureAt = Date.now(); s.totalRequests++; s.totalFailures++
  s.lastErrorCode = c.isQuota ? "429" : c.isRateLimit ? "rate_limit" : "error"
  s.lastErrorMessage = errMsg.slice(0, 200)
  if (c.isQuota) { s.isQuotaExhausted = true; s.quotaResetAt = Date.now() + c.retryAfterMs; s.cooldownUntil = s.quotaResetAt }
  else if (c.isRateLimit) { s.isRateLimited = true; s.cooldownUntil = Date.now() + c.retryAfterMs }
  else if (c.isAuth || c.isNotFound) { s.cooldownUntil = Date.now() + 300_000 }
  else { s.cooldownUntil = Date.now() + Math.min(2 ** s.consecutiveFailures * 2000, 300_000) }
  persistHealth(id)
}

export async function refreshProviderHealth() {
  await warmHealthFromDB()
  const now = Date.now()
  const probes: Promise<void>[] = []
  for (const cfg of PROVIDERS) {
    if (!cfg.enabled) continue
    const s = getState(cfg.id)
    if ((now > s.cooldownUntil && s.consecutiveFailures > 0) || (now - s.lastProbeAt > 120_000)) {
      s.lastProbeAt = now
      probes.push(probeProvider(cfg).then(r => {
        if (r.ok) { s.consecutiveFailures = 0; s.lastSuccessAt = now; s.cooldownUntil = 0; s.isQuotaExhausted = false; s.isRateLimited = false; s.avgLatencyMs = s.avgLatencyMs > 0 ? Math.round(s.avgLatencyMs * 0.5 + r.latencyMs * 0.5) : r.latencyMs; persistHealth(cfg.id) }
      }).catch(() => {}))
    }
  }
  await Promise.allSettled(probes)
}

export async function orchestrate(req: AIRequest): Promise<GatewayResult> {
  let provider = await selectProvider()
  const diag: ProviderCallDiag[] = []
  if (!provider) { await refreshProviderHealth(); provider = await selectProvider() }
  if (!provider) { const err: any = new Error("All providers unhealthy"); err.diag = diag; throw err }
  return tryProvider(provider, req, diag)
}

async function tryProvider(cfg: ProviderConfig, req: AIRequest, diag: ProviderCallDiag[]): Promise<GatewayResult> {
  const s = getState(cfg.id); const rc = s.consecutiveFailures
  diag.push({ provider: cfg.id, model: cfg.model, event: "attempt", retryCount: rc, promptLen: req.prompt.length })
  try {
    const response = await rawCallProvider(cfg.id, req, rc, diag)
    recordOrchSuccess(cfg.id, response.latencyMs)
    return { response, fallbackUsed: rc > 0, fallbackChain: [cfg.id], diag }
  } catch (e: any) {
    recordOrchFailure(cfg.id, e instanceof Error ? e.message : String(e))
    const next = await selectProvider()
    if (next && next.id !== cfg.id) return tryProvider(next, req, diag)
    const err: any = new Error(`AI pipeline failed. Last: ${cfg.id}: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`)
    err.diag = diag; throw err
  }
}

export function getOrchHealth(): Array<{ id: string; enabled: boolean; healthy: boolean; inCooldown: boolean; consecutiveFailures: number; avgLatencyMs: number; quotaExhausted: boolean; lastError: string }> {
  const now = Date.now()
  return PROVIDERS.map(cfg => {
    const s = getState(cfg.id)
    return { id: cfg.id, enabled: cfg.enabled, healthy: s.consecutiveFailures === 0 && !s.isQuotaExhausted && !s.isRateLimited && now > s.cooldownUntil, inCooldown: now < s.cooldownUntil, consecutiveFailures: s.consecutiveFailures, avgLatencyMs: s.avgLatencyMs, quotaExhausted: s.isQuotaExhausted, lastError: s.lastErrorMessage.slice(0, 100) }
  })
}

export { warmHealthFromDB }
export { probeProvider }
