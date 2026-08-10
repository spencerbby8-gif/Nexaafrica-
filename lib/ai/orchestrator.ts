/**
 * AI Orchestrator — Routes every request through the Smart Router.
 * 
 * Pipeline:
 *   1. Sync health from DB (cold start recovery)
 *   2. Smart Router selects best provider for task type
 *   3. Call provider via gateway
 *   4. Log routing decision with full reasoning
 *   5. On failure: router re-scores (penalizes failed provider), tries next
 *   6. Persist health state to DB
 */

import { PROVIDERS, type ProviderId, type ProviderConfig } from "./providers/types"
import { callProvider as rawCallProvider, type GatewayResult, type AIRequest, type AIResponse, type ProviderCallDiag } from "./gateway"
import {
  routeTask,
  routeTaskAll,
  recordRouterSuccess,
  recordRouterFailure,
  syncHealthFromDB,
  logRoutingDecision,
  tagPendingTask,
  getRouterHealthSnapshot,
  type TaskType,
  type RoutingLog,
} from "./smart-router"

let lastHealthSync = 0
const HEALTH_SYNC_INTERVAL_MS = 5 * 60 * 1000

async function ensureHealthSynced() {
  // Timestamp-based lazy resync: no timers (setTimeout leaks in serverless).
  if (Date.now() - lastHealthSync > HEALTH_SYNC_INTERVAL_MS) {
    await syncHealthFromDB()
    lastHealthSync = Date.now()
  }
}

function detectTaskType(agentId: string): TaskType | undefined {
  const id = agentId.toLowerCase()
  if (id.includes('cv') || id.includes('profile')) return 'cv_parsing'
  if (id.includes('verifier') || id.includes('extract') || id.includes('consolidated')) return 'fast_extraction'
  if (id.includes('job') || id.includes('intelligence')) return 'job_intelligence'
  if (id.includes('analysis') || id.includes('complex')) return 'complex_analysis'
  if (id.includes('bulk') || id.includes('batch')) return 'bulk_processing'
  if (id.includes('code')) return 'code_analysis'
  if (id.includes('edge')) return 'edge_processing'
  if (id.includes('european')) return 'european_jobs'
  if (id.includes('gpu')) return 'gpu_accelerated'
  if (id.includes('simple')) return 'simple_analysis'
  return undefined
}

export async function selectProvider(taskType?: string): Promise<ProviderConfig | null> {
  await ensureHealthSynced()
  const decision = routeTask(taskType as TaskType | undefined)
  return decision?.provider || null
}

export async function orchestrate(req: AIRequest): Promise<GatewayResult> {
  await ensureHealthSynced()

  const taskType = detectTaskType(req.agentId)
  const ranked = routeTaskAll(taskType)

  if (ranked.length === 0) {
    // Force a health re-sync and retry once
    lastHealthSync = 0
    await ensureHealthSynced()
    const retryRanked = routeTaskAll(taskType)
    if (retryRanked.length === 0) {
      const err: any = new Error("All providers unhealthy — no routing candidates")
      err.diag = []
      throw err
    }
    return executeRoutingChain(retryRanked, req, taskType)
  }

  return executeRoutingChain(ranked, req, taskType)
}

async function executeRoutingChain(
  ranked: ReturnType<typeof routeTaskAll>,
  req: AIRequest,
  taskType: TaskType | undefined,
): Promise<GatewayResult> {
  const diag: ProviderCallDiag[] = []
  const maxAttempts = Math.min(ranked.length, 7) // Try up to 7 providers (was 4 — blocked 5 providers from ever being tried)
  const startTime = Date.now()
  let lastError: Error | null = null
  let fallbackUsed = false
  const fallbackChain: ProviderId[] = []

  // [DIAGNOSTIC] Log which providers are being skipped and why
  const skipped = ranked.slice(maxAttempts).filter(d => d.score > 0)
  if (skipped.length > 0) {
    console.log(JSON.stringify({
      scope: "orchestrator",
      event: "providers_skipped",
      agentId: req.agentId,
      jobId: req.jobId,
      maxAttempts,
      willTry: ranked.slice(0, maxAttempts).map(d => `${d.provider.id}(${Math.round(d.score)})`),
      skipped: skipped.map(d => `${d.provider.id}(${Math.round(d.score)})`),
    }))
  }

  // [DIAGNOSTIC] Check for missing API keys before attempting
  for (let i = 0; i < maxAttempts; i++) {
    const d = ranked[i]
    if (!d || d.score <= 0) break
    const apiKey = process.env[d.provider.envKey]
    if (!apiKey) {
      console.log(JSON.stringify({
        scope: "orchestrator",
        event: "missing_api_key",
        provider: d.provider.id,
        envKey: d.provider.envKey,
        rank: i + 1,
        score: Math.round(d.score),
      }))
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const decision = ranked[attempt]
    if (!decision || decision.score <= 0) break

    const cfg = decision.provider
    fallbackChain.push(cfg.id)
    tagPendingTask(cfg.id, taskType)

    if (attempt > 0) fallbackUsed = true

    diag.push({
      provider: cfg.id,
      model: cfg.model,
      event: "attempt",
      retryCount: attempt,
      promptLen: req.prompt.length,
    })

    try {
      const response = await rawCallProvider(cfg.id, req, attempt, diag)
      
      // Record success in smart router
      recordRouterSuccess(cfg.id, response.latencyMs)

      // Log the routing decision (SUCCESS)
      logRoutingDecision({
        timestamp: new Date().toISOString(),
        agentId: req.agentId,
        jobId: req.jobId,
        taskType: taskType || 'unknown',
        selected: cfg.id,
        selectedModel: cfg.model,
        score: decision.score,
        reasoning: decision.reasoning,
        alternatives: ranked.slice(attempt + 1, attempt + 4).map(d => ({
          provider: d.provider.id,
          score: Math.round(d.score * 10) / 10,
          reason: d.reasoning.slice(0, 2).join('; '),
        })),
        fallbackUsed,
        latencyMs: response.latencyMs,
        outcome: 'success',
      })

      return {
        response,
        fallbackUsed,
        fallbackChain,
        diag,
      }
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e)
      lastError = e

      // Record failure in smart router (triggers cooldown + re-scoring)
      recordRouterFailure(cfg.id, errMsg)

      diag.push({
        provider: cfg.id,
        model: cfg.model,
        event: "failure",
        errorMessage: errMsg.slice(0, 300),
        retryCount: attempt,
        durationMs: Date.now() - startTime,
        promptLen: req.prompt.length,
      })

      console.log(JSON.stringify({
        scope: "orchestrator",
        event: "provider_failed",
        provider: cfg.id,
        attempt: attempt + 1,
        maxAttempts,
        error: errMsg.slice(0, 200),
        willRetry: attempt < maxAttempts - 1,
      }))
    }
  }

  // All providers in the chain failed
  logRoutingDecision({
    timestamp: new Date().toISOString(),
    agentId: req.agentId,
    jobId: req.jobId,
    taskType: taskType || 'unknown',
    selected: fallbackChain[fallbackChain.length - 1] || 'none',
    selectedModel: '',
    score: 0,
    reasoning: ['All providers in failover chain failed'],
    alternatives: [],
    fallbackUsed: true,
    latencyMs: Date.now() - startTime,
    outcome: 'failure',
    errorSummary: lastError?.message?.slice(0, 200) || 'Unknown error',
  })

  const err: any = new Error(
    `AI pipeline failed after ${fallbackChain.length} provider(s) [${fallbackChain.join('→')}]. Last: ${lastError?.message?.slice(0, 200) || 'unknown'}`
  )
  err.diag = diag
  throw err
}

export function recordOrchSuccess(id: ProviderId, latencyMs: number) {
  recordRouterSuccess(id, latencyMs)
}

export function recordOrchFailure(id: ProviderId, errMsg: string) {
  recordRouterFailure(id, errMsg)
}

// ─── Health probe (kept for backward compat) ────────────────────

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
    if (["groq","cerebras","openrouter","cohere"].includes(cfg.id)) {
      const urls: Record<string,string> = { groq: "https://api.groq.com/openai/v1/chat/completions", cerebras: "https://api.cerebras.ai/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions", cohere: "https://api.cohere.ai/compatibility/v1/chat/completions" }
      const body: any = { model: cfg.model, messages: [{ role: "user", content: "ok" }], temperature: 0, max_tokens: 5 }
      if (cfg.id === "openrouter") body.provider = { order: ["deepinfra"], allow_fallbacks: false }
      const res = await fetch(urls[cfg.id], { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` }, body: JSON.stringify(body) })
      if (!res.ok) { const errText = await res.text(); return { ok: false, latencyMs: Date.now() - start, error: errText.slice(0, 300) } }
      return { ok: true, latencyMs: Date.now() - start }
    }
    return { ok: false, latencyMs: 0, error: `${cfg.id} not probeable` }
  } catch (e: any) { return { ok: false, latencyMs: Date.now() - start, error: e?.message || String(e) } }
}

export async function refreshProviderHealth() {
  lastHealthSync = 0
  await ensureHealthSynced()
}

export async function warmHealthFromDB() {
  await ensureHealthSynced()
}

export function getOrchHealth(): Array<{ id: string; enabled: boolean; healthy: boolean; inCooldown: boolean; consecutiveFailures: number; avgLatencyMs: number; quotaExhausted: boolean; lastError: string }> {
  // Real measured state from the router (no fabricated fields).
  return getRouterHealthSnapshot().map(s => ({
    id: s.id,
    enabled: s.enabled,
    healthy: s.healthy,
    inCooldown: s.inCooldown,
    consecutiveFailures: s.consecutiveFailures,
    avgLatencyMs: s.avgLatencyMs,
    quotaExhausted: s.quotaExhausted,
    lastError: s.lastError,
  }))
}

export { probeProvider }
