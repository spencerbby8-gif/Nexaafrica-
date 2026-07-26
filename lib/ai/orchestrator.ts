/**
 * AI Orchestrator — health-aware provider routing engine.
 *
 * Replaces sequential failover with intelligent routing:
 *   - Continuously monitors provider health (latency, quotas, rate limits, errors)
 *   - Routes to the healthiest available provider
 *   - Automatically skips unhealthy or rate-limited providers
 *   - Probes recovering providers with lightweight pings
 *   - Restores providers when they recover
 *   - Never lets one failing provider block the pipeline
 *
 * Preserves the existing GatewayResult / AIRequest / AIResponse contracts.
 */

import { PROVIDERS, type ProviderId, type ProviderConfig } from "./providers/types"
import { callProvider as rawCallProvider, type GatewayResult, type AIRequest, type AIResponse, type ProviderCallDiag } from "./gateway"

// ── Orchestrator health state (in-memory, enriched by probes) ────────

interface ProviderState {
  id: ProviderId
  consecutiveFailures: number
  lastFailureAt: number       // Date.now() of last failure
  lastSuccessAt: number       // Date.now() of last success
  lastProbeAt: number         // Date.now() of last probe
  cooldownUntil: number       // Date.now() until which we skip this provider
  lastErrorCode: string       // "429", "rate_limit_exceeded", "ApiError", etc.
  lastErrorMessage: string
  avgLatencyMs: number        // rolling average
  totalRequests: number
  totalFailures: number
  isQuotaExhausted: boolean   // true when we got a 429 / rate_limit_exceeded
  quotaResetAt: number        // Date.now() estimate when quota resets
  isRateLimited: boolean      // true when provider returned rate_limit_exceeded
}

const stateMap = new Map<ProviderId, ProviderState>()

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

// ── Classification of failures ────────────────────────────────────────

const PING_PROMPT = "ok"

function classifyError(errMsg: string): {
  isQuota: boolean; isRateLimit: boolean; isAuth: boolean; isNotFound: boolean
  retryAfterMs: number
} {
  const msg = (errMsg || "").toLowerCase()
  const quota = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota exceeded") || msg.includes("exceeded your current quota")
  const rate = msg.includes("rate_limit") || msg.includes("rate limit reached") || msg.includes("tokens per day")
  const auth = msg.includes("401") || msg.includes("403") || msg.includes("invalid api key") || msg.includes("unauthorized")
  const nf = msg.includes("404") || msg.includes("model does not exist") || msg.includes("no endpoints found")

  // Extract retry-after hints
  let retryAfterMs = 0
  const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/)
  if (retryMatch) retryAfterMs = Math.ceil(parseFloat(retryMatch[1]) * 1000)
  const minMatch = msg.match(/(\d+)m(\d+(?:\.\d+)?)s/)
  if (minMatch) retryAfterMs = (parseInt(minMatch[1]) * 60 + parseFloat(minMatch[2])) * 1000

  // Default cooldowns
  if (quota && retryAfterMs === 0) retryAfterMs = 60_000   // 1min for quota
  if (rate && retryAfterMs === 0) retryAfterMs = 120_000   // 2min for rate limits

  return { isQuota: quota, isRateLimit: rate, isAuth: auth, isNotFound: nf, retryAfterMs }
}

// ── Provider probing — lightweight ping to check health ───────────────

async function probeProvider(cfg: ProviderConfig): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const apiKey = process.env[cfg.envKey]
  if (!apiKey) return { ok: false, latencyMs: 0, error: `No ${cfg.envKey}` }

  const start = Date.now()
  try {
    if (cfg.id.startsWith("gemini")) {
      const { GoogleGenAI } = await import("@google/genai")
      const ai = new GoogleGenAI({ apiKey })
      await ai.models.generateContent({
        model: cfg.model,
        contents: [{ role: "user", parts: [{ text: PING_PROMPT }] }],
        config: { temperature: 0, maxOutputTokens: 5 },
      })
      return { ok: true, latencyMs: Date.now() - start }
    }
    if (["groq", "cerebras", "openrouter"].includes(cfg.id)) {
      const urls: Record<string, string> = {
        groq: "https://api.groq.com/openai/v1/chat/completions",
        cerebras: "https://api.cerebras.ai/v1/chat/completions",
        openrouter: "https://openrouter.ai/api/v1/chat/completions",
      }
      const res = await fetch(urls[cfg.id], {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: PING_PROMPT }], temperature: 0, max_tokens: 5 }),
      })
      if (!res.ok) {
        const errText = await res.text()
        return { ok: false, latencyMs: Date.now() - start, error: errText.slice(0, 300) }
      }
      return { ok: true, latencyMs: Date.now() - start }
    }
    return { ok: false, latencyMs: 0, error: `Provider ${cfg.id} not probeable` }
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - start, error: e?.message || String(e) }
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/** Get the best provider to use right now, or null if all are unhealthy. */
export function selectProvider(): ProviderConfig | null {
  const now = Date.now()
  const enabled = PROVIDERS.filter(p => p.enabled)
  if (enabled.length === 0) return null

  // Score each provider: healthy + low latency + not in cooldown
  const scored = enabled.map(cfg => {
    const s = getState(cfg.id)
    const inCooldown = now < s.cooldownUntil
    const quotaOk = !s.isQuotaExhausted || now > s.quotaResetAt

    // A provider is usable if: enabled, not in cooldown, quota not exhausted
    const usable = !inCooldown && quotaOk

    // Score: prefer lower latency, fewer failures, higher priority (lower number)
    const latencyPenalty = s.avgLatencyMs > 0 ? s.avgLatencyMs / 100 : 0
    const failurePenalty = s.consecutiveFailures * 10
    const priorityBonus = (10 - cfg.priority) * 5
    const score = usable ? priorityBonus - latencyPenalty - failurePenalty : -9999

    return { cfg, score, usable, inCooldown, quotaOk, state: s }
  })

  // Sort by score descending — best first
  scored.sort((a, b) => b.score - a.score)

  // Return the best usable provider
  const best = scored[0]
  if (best && best.usable) return best.cfg

  // If everything is in cooldown, try the one with the soonest cooldown expiry
  const soonest = scored.filter(s => s.inCooldown).sort((a, b) => a.state.cooldownUntil - b.state.cooldownUntil)[0]
  if (soonest && soonest.state.cooldownUntil - now < 30_000) {
    // Less than 30s until cooldown ends — worth waiting
    return null // caller should wait or fall back to regex
  }

  return null
}

/** Record a successful provider call. */
export function recordOrchSuccess(id: ProviderId, latencyMs: number) {
  const s = getState(id)
  s.consecutiveFailures = 0
  s.lastSuccessAt = Date.now()
  s.totalRequests++
  s.avgLatencyMs = s.avgLatencyMs > 0 ? Math.round((s.avgLatencyMs * 0.7 + latencyMs * 0.3)) : latencyMs
  s.isQuotaExhausted = false
  s.isRateLimited = false
  s.cooldownUntil = 0
}

/** Record a failed provider call and classify the failure. */
export function recordOrchFailure(id: ProviderId, errMsg: string) {
  const s = getState(id)
  const classification = classifyError(errMsg)
  s.consecutiveFailures++
  s.lastFailureAt = Date.now()
  s.totalRequests++
  s.totalFailures++
  s.lastErrorCode = classification.isQuota ? "429" : classification.isRateLimit ? "rate_limit" : "error"
  s.lastErrorMessage = errMsg.slice(0, 200)

  if (classification.isQuota) {
    s.isQuotaExhausted = true
    s.quotaResetAt = Date.now() + classification.retryAfterMs
    s.cooldownUntil = s.quotaResetAt
  } else if (classification.isRateLimit) {
    s.isRateLimited = true
    s.cooldownUntil = Date.now() + classification.retryAfterMs
  } else if (classification.isAuth || classification.isNotFound) {
    // Auth/not-found errors are permanent — long cooldown
    s.cooldownUntil = Date.now() + 300_000 // 5 minutes
  } else {
    // Generic failure — exponential backoff
    const backoff = Math.min(Math.pow(2, s.consecutiveFailures) * 1000, 60_000)
    s.cooldownUntil = Date.now() + backoff
  }
}

/**
 * Probe all providers and update health state. Call periodically
 * (every 60s) to detect recovery of previously unhealthy providers.
 */
export async function refreshProviderHealth() {
  const now = Date.now()
  const probes: Promise<void>[] = []

  for (const cfg of PROVIDERS) {
    if (!cfg.enabled) continue
    const s = getState(cfg.id)

    // Only probe if: in cooldown + past cooldown expiry, or never probed recently
    const shouldProbe = (now > s.cooldownUntil && s.consecutiveFailures > 0) || (now - s.lastProbeAt > 120_000)

    if (shouldProbe) {
      s.lastProbeAt = now
      probes.push(
        probeProvider(cfg).then(result => {
          if (result.ok) {
            s.consecutiveFailures = 0
            s.lastSuccessAt = now
            s.cooldownUntil = 0
            s.isQuotaExhausted = false
            s.isRateLimited = false
            s.avgLatencyMs = s.avgLatencyMs > 0 ? Math.round(s.avgLatencyMs * 0.5 + result.latencyMs * 0.5) : result.latencyMs
          }
        }).catch(() => {})
      )
    }
  }

  await Promise.allSettled(probes)
}

/**
 * Main entry point: route a request through the healthiest provider.
 * Falls back to regex if all providers are unhealthy.
 * Preserves the existing GatewayResult contract.
 */
export async function orchestrate(req: AIRequest): Promise<GatewayResult> {
  const provider = selectProvider()
  const diag: ProviderCallDiag[] = []

  if (!provider) {
    // All providers unhealthy — resolve circuit and probe
    await refreshProviderHealth()

    // Try one more time after refresh
    const retry = selectProvider()
    if (!retry) {
      const err = new Error("All AI providers unhealthy — using deterministic fallback") as any
      err.diag = diag
      throw err
    }

    // Use the recovered provider
    return tryProvider(retry, req, diag)
  }

  return tryProvider(provider, req, diag)
}

async function tryProvider(cfg: ProviderConfig, req: AIRequest, diag: ProviderCallDiag[]): Promise<GatewayResult> {
  const s = getState(cfg.id)
  const retryCount = s.consecutiveFailures
  const start = Date.now()

  diag.push({ provider: cfg.id, model: cfg.model, event: "attempt", retryCount, promptLen: req.prompt.length })

  try {
    const response = await rawCallProvider(cfg.id, req, retryCount, diag)
    recordOrchSuccess(cfg.id, response.latencyMs)

    return {
      response,
      fallbackUsed: retryCount > 0,
      fallbackChain: [cfg.id],
      diag,
    }
  } catch (e: any) {
    const errMsg = e instanceof Error ? e.message : String(e)
    recordOrchFailure(cfg.id, errMsg)

    // Try next best provider instead of giving up
    const next = selectProvider()
    if (next && next.id !== cfg.id) {
      return tryProvider(next, req, diag)
    }

    // No more providers — final failure
    const err = new Error(`AI pipeline failed. Last: ${cfg.id}: ${errMsg.slice(0, 200)}`) as any
    err.diag = diag
    throw err
  }
}

/** Get current health snapshot for all providers (for /api/ai/health). */
export function getOrchHealth(): Array<{
  id: string; enabled: boolean; healthy: boolean; inCooldown: boolean
  consecutiveFailures: number; avgLatencyMs: number; quotaExhausted: boolean
  lastError: string
}> {
  return PROVIDERS.map(cfg => {
    const s = getState(cfg.id)
    const now = Date.now()
    return {
      id: cfg.id, enabled: cfg.enabled,
      healthy: s.consecutiveFailures === 0 && !s.isQuotaExhausted && !s.isRateLimited && now > s.cooldownUntil,
      inCooldown: now < s.cooldownUntil,
      consecutiveFailures: s.consecutiveFailures,
      avgLatencyMs: s.avgLatencyMs,
      quotaExhausted: s.isQuotaExhausted,
      lastError: s.lastErrorMessage.slice(0, 100),
    }
  })
}
