/**
 * Smart AI Router — v2 (measurement-driven, no structural bias)
 *
 * Rebuilt 2026-07-30 after live production verification proved structural
 * exclusion: 5 of 10 configured providers (mistral, nvidia, github_models,
 * huggingface, gemini_backup) had NEVER been attempted in production because
 * static `taskTypes` affinity was worth 40/100 points and cold instances fell
 * back to compile-time priority ordering.
 *
 * v2 principles:
 *
 * 1. EVERY enabled provider participates in EVERY task. There are no static
 *    task-affinity gates. Task fit is LEARNED from measured per-task outcomes
 *    (persisted in ai_orch_health.task_stats), never declared in code.
 * 2. Scores are derived from live evidence:
 *      - measured success rate      (recent, persisted across cold starts)
 *      - measured latency           (EWMA, persisted)
 *      - measured per-task fitness  (persisted)
 *      - availability gates         (cooldown / quota backoff — live state)
 *      - exploration bonus          (unmeasured providers get surfaced so
 *                                    they accumulate real measurements)
 *      - recency of last success
 *      - declared cost + configured priority are TIE-BREAKERS only (<=13 pts
 *        combined of ~100), documented as static inputs.
 * 3. Health state survives cold starts: every outcome is written through to
 *    `ai_orch_health` (best-effort, non-blocking) and re-synced on boot.
 * 4. Nothing is permanently excluded. Failures trigger exponential cooldown
 *    (30s -> 30m cap); after expiry the provider re-enters candidacy, so a
 *    transiently-dead provider self-heals and a genuinely dead one simply
 *    sinks to the bottom of the ranking on evidence.
 */

import type { ProviderId, ProviderConfig } from "./providers/types"
import { getProviders } from "./providers/dynamic-registry"

// ─── Types ──────────────────────────────────────────────────────

export type TaskType =
  | 'job_intelligence'
  | 'fast_extraction'
  | 'cv_parsing'
  | 'complex_analysis'
  | 'bulk_processing'
  | 'simple_analysis'
  | 'code_analysis'
  | 'edge_processing'
  | 'european_jobs'
  | 'gpu_accelerated'
  | 'fallback'
  | 'profile_transform'

export interface RoutingDecision {
  provider: ProviderConfig
  score: number
  reasoning: string[]
  factors: RoutingFactors
}

export interface RoutingFactors {
  measuredHealth: number      // 0-30  — recent measured success rate (live+persisted)
  latencyScore: number        // 0-20  — measured average latency bands
  taskFit: number             // 0-20  — measured success on this task type
  costScore: number           // 0-10  — declared unit cost (static metadata)
  explorationBonus: number    // 0-10  — inversely proportional to sample count
  recencyScore: number        // 0-7   — how recently the provider last succeeded
  configTieBreak: number      // 0-3   — configured priority, tie-breaker ONLY
}

export interface RoutingLog {
  timestamp: string
  agentId: string
  jobId?: string
  taskType: string
  selected: string
  selectedModel: string
  score: number
  reasoning: string[]
  alternatives: Array<{ provider: string; score: number; reason: string }>
  fallbackUsed: boolean
  latencyMs?: number
  outcome?: 'success' | 'failure'
  errorSummary?: string
}

// ─── Health state (in-memory hot cache, persisted to ai_orch_health) ──

interface TaskStat { ok: number; fail: number; totalMs: number }

interface ProviderHealthState {
  consecutiveFailures: number
  lastFailureAt: number
  lastSuccessAt: number
  cooldownUntil: number
  isQuotaExhausted: boolean
  quotaResetAt: number
  isRateLimited: boolean
  avgLatencyMs: number
  totalSuccesses: number
  totalFailures: number
  lastError?: string
  taskStats: Record<string, TaskStat>
}

const healthState = new Map<ProviderId, ProviderHealthState>()

function emptyHealth(): ProviderHealthState {
  return {
    consecutiveFailures: 0, lastFailureAt: 0, lastSuccessAt: 0,
    cooldownUntil: 0, isQuotaExhausted: false, quotaResetAt: 0,
    isRateLimited: false, avgLatencyMs: 0, totalSuccesses: 0,
    totalFailures: 0, taskStats: {},
  }
}

function getHealth(id: ProviderId): ProviderHealthState {
  if (!healthState.has(id)) healthState.set(id, emptyHealth())
  return healthState.get(id)!
}

// ─── Routing log buffer ─────────────────────────────────────────

const routingLogs: RoutingLog[] = []
const MAX_LOGS = 500

function logRoutingDecision(log: RoutingLog): void {
  routingLogs.push(log)
  if (routingLogs.length > MAX_LOGS) routingLogs.shift()
  console.log(JSON.stringify({
    scope: "smart_router",
    ts: log.timestamp,
    taskType: log.taskType,
    selected: log.selected,
    model: log.selectedModel,
    score: Math.round(log.score * 10) / 10,
    fallback: log.fallbackUsed,
    outcome: log.outcome || "pending",
    ...(log.latencyMs ? { latencyMs: log.latencyMs } : {}),
  }))
}

// ─── Core scoring ───────────────────────────────────────────────

const GATE_SCORE = -10000
const NEUTRAL_HEALTH = 18      // untested providers: neutral, not punished
const NEUTRAL_LATENCY = 10
const NEUTRAL_TASKFIT = 12

function latencyBand(avgMs: number): number {
  if (avgMs <= 0) return NEUTRAL_LATENCY
  if (avgMs < 800) return 20
  if (avgMs < 2000) return 16
  if (avgMs < 5000) return 10
  if (avgMs < 12000) return 5
  return 2
}

function recencyBand(lastSuccessAt: number, now: number): number {
  if (!lastSuccessAt) return 0
  const age = now - lastSuccessAt
  if (age < 5 * 60_000) return 7
  if (age < 60 * 60_000) return 5
  if (age < 24 * 60 * 60_000) return 3
  return 1
}

function isGated(cfg: ProviderConfig, h: ProviderHealthState, now: number): string | null {
  if (!cfg.enabled) return 'Disabled in config'
  if (now < h.cooldownUntil) {
    const remaining = Math.ceil((h.cooldownUntil - now) / 1000)
    return h.isQuotaExhausted && now < h.quotaResetAt
      ? `Quota backoff (${remaining}s remaining)`
      : h.isRateLimited
        ? `Rate-limit backoff (${remaining}s remaining)`
        : `Failure cooldown (${remaining}s remaining)`
  }
  if (h.isQuotaExhausted && now < h.quotaResetAt) return 'Quota exhausted (backoff active)'
  return null
}

function scoreProvider(
  cfg: ProviderConfig,
  taskType: TaskType | undefined,
  now: number,
): RoutingDecision {
  const h = getHealth(cfg.id)
  const zero = { measuredHealth: 0, latencyScore: 0, taskFit: 0, costScore: 0, explorationBonus: 0, recencyScore: 0, configTieBreak: 0 }

  const gate = isGated(cfg, h, now)
  if (gate) {
    return { provider: cfg, score: GATE_SCORE, reasoning: [gate], factors: zero }
  }

  const reasoning: string[] = []
  const samples = h.totalSuccesses + h.totalFailures

  // ── Factor 1: Measured health (0-30) ──
  let measuredHealth: number
  if (samples === 0) {
    measuredHealth = NEUTRAL_HEALTH
    reasoning.push('No call history — eligible for measurement')
  } else {
    const successRate = (h.totalSuccesses / samples) * 100
    measuredHealth = Math.round(successRate * 0.3)
    if (h.consecutiveFailures > 0) {
      measuredHealth -= Math.min(h.consecutiveFailures * 3, 12)
      reasoning.push(`${h.consecutiveFailures} consecutive failure(s), success ${successRate.toFixed(0)}% over ${samples} calls`)
    } else {
      reasoning.push(`Success ${successRate.toFixed(0)}% over ${samples} measured call(s)`)
    }
    measuredHealth = Math.max(0, Math.min(30, measuredHealth))
  }

  // ── Factor 2: Measured latency (0-20) ──
  const latencyScore = latencyBand(h.avgLatencyMs)
  reasoning.push(h.avgLatencyMs > 0 ? `Measured latency ~${h.avgLatencyMs}ms` : 'No latency measurements yet')

  // ── Factor 3: Measured task fit (0-20) ──
  let taskFit = NEUTRAL_TASKFIT
  if (taskType) {
    const ts = h.taskStats[taskType]
    const tSamples = ts ? ts.ok + ts.fail : 0
    if (ts && tSamples > 0) {
      taskFit = Math.round((ts.ok / tSamples) * 20)
      reasoning.push(`Task "${taskType}": ${ts.ok}/${tSamples} measured successes`)
    } else {
      reasoning.push(`Task "${taskType}" unmeasured for this provider (neutral)`)
    }
  } else {
    reasoning.push('No task type specified (neutral fit)')
  }

  // ── Factor 4: Declared cost (0-10) ──
  let costScore: number
  if (cfg.costPer1kTokens === 0) costScore = 10
  else if (cfg.costPer1kTokens <= 1) costScore = 8
  else if (cfg.costPer1kTokens <= 2) costScore = 6
  else costScore = 4
  reasoning.push(cfg.costPer1kTokens === 0 ? 'Free tier' : `Declared cost score ${costScore}/10`)

  // ── Factor 5: Exploration bonus (0-10) — decays with measured samples ──
  const explorationBonus = samples >= 20 ? 0 : Math.round((1 - samples / 20) * 10)
  if (explorationBonus > 0) reasoning.push(`Exploration bonus +${explorationBonus} (${samples}/20 measured samples)`)

  // ── Factor 6: Recency of last measured success (0-7) ──
  const recencyScore = recencyBand(h.lastSuccessAt, now)
  if (recencyScore > 0) reasoning.push('Recently succeeded')

  // ── Factor 7: Config tie-break (0-3) — static input, tie-breaker only ──
  const configTieBreak = Math.max(0, Math.round(((11 - cfg.priority) / 10) * 3))

  const totalScore = measuredHealth + latencyScore + taskFit + costScore + explorationBonus + recencyScore + configTieBreak

  return {
    provider: cfg,
    score: totalScore,
    reasoning,
    factors: { measuredHealth, latencyScore, taskFit, costScore, explorationBonus, recencyScore, configTieBreak },
  }
}

// ─── Public API ─────────────────────────────────────────────────

/** Route to the best provider for a task. Returns the top-ranked decision. */
export function routeTask(taskType?: TaskType): RoutingDecision | null {
  const now = Date.now()
  // P2: read the LIVE registry (discovered + verified models), not static assumptions
  const decisions = getProviders().map(cfg => scoreProvider(cfg, taskType, now))
  decisions.sort((a, b) => b.score - a.score)
  const best = decisions[0]
  if (!best || best.score <= 0) return null
  return best
}

/** Get ALL non-gated providers ranked for a task (failover/exploration chain). */
export function routeTaskAll(taskType?: TaskType): RoutingDecision[] {
  const now = Date.now()
  // P2: read the LIVE registry (discovered + verified models), not static assumptions
  const decisions = getProviders().map(cfg => scoreProvider(cfg, taskType, now))
  decisions.sort((a, b) => b.score - a.score)
  return decisions.filter(d => d.score > 0)
}

// ─── Persistence (best-effort write-through to ai_orch_health) ──

function persistHealth(id: ProviderId, errorCode: string | null = null): void {
  const h = healthState.get(id)
  if (!h) return
  const row = {
    provider: id,
    updated_at: new Date().toISOString(),
    consecutive_failures: h.consecutiveFailures,
    last_failure_at: h.lastFailureAt ? new Date(h.lastFailureAt).toISOString() : null,
    last_success_at: h.lastSuccessAt ? new Date(h.lastSuccessAt).toISOString() : null,
    cooldown_until: h.cooldownUntil ? new Date(h.cooldownUntil).toISOString() : null,
    last_error_code: errorCode,
    last_error_message: (h.lastError || '').slice(0, 500) || null,
    avg_latency_ms: h.avgLatencyMs > 0 ? Math.round(h.avgLatencyMs) : null,
    is_quota_exhausted: h.isQuotaExhausted,
    quota_reset_at: h.quotaResetAt ? new Date(h.quotaResetAt).toISOString() : null,
    is_rate_limited: h.isRateLimited,
    total_successes: h.totalSuccesses,
    total_failures: h.totalFailures,
    task_stats: h.taskStats,
  }
  // Fire-and-forget: routing latency must never depend on the DB write.
  void (async () => {
    try {
      const { createServiceClient } = await import("@/lib/supabase/service")
      const supabase = createServiceClient()
      await supabase.from("ai_orch_health").upsert(row, { onConflict: "provider" })
    } catch {
      // Persistence is best-effort; the in-memory state is still correct for
      // this instance and the next sync will heal drift.
    }
  })()
}

function recordTaskStat(h: ProviderHealthState, taskType: string | undefined, ok: boolean, latencyMs?: number): void {
  if (!taskType) return
  const ts = h.taskStats[taskType] || { ok: 0, fail: 0, totalMs: 0 }
  if (ok) { ts.ok++; if (latencyMs) ts.totalMs += latencyMs } else { ts.fail++ }
  h.taskStats[taskType] = ts
}

// task-type context for record* (orchestrator knows the task; set per-request chain)
const pendingTask = new Map<ProviderId, string | undefined>()
export function tagPendingTask(id: ProviderId, taskType: string | undefined): void {
  pendingTask.set(id, taskType)
}

/** Record a successful provider call — updates routing health + persists. */
export function recordRouterSuccess(providerId: ProviderId, latencyMs: number): void {
  const h = getHealth(providerId)
  h.consecutiveFailures = 0
  h.lastSuccessAt = Date.now()
  h.totalSuccesses++
  h.avgLatencyMs = h.avgLatencyMs > 0
    ? Math.round(h.avgLatencyMs * 0.7 + latencyMs * 0.3)
    : latencyMs
  h.isQuotaExhausted = false
  h.isRateLimited = false
  h.cooldownUntil = 0
  h.lastError = undefined
  recordTaskStat(h, pendingTask.get(providerId) ?? undefined, true, latencyMs)
  pendingTask.delete(providerId)
  persistHealth(providerId)
}

/** Record a failed provider call — escalating cooldown + persists. */
export function recordRouterFailure(providerId: ProviderId, errMsg: string): void {
  const h = getHealth(providerId)
  h.consecutiveFailures++
  h.lastFailureAt = Date.now()
  h.totalFailures++
  h.lastError = errMsg.slice(0, 300)
  recordTaskStat(h, pendingTask.get(providerId) ?? undefined, false)
  pendingTask.delete(providerId)

  const msg = errMsg.toLowerCase()
  const isQuota = msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('insufficient credits')
  const isRateLimit = msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('too many requests')
  const isAuth = msg.includes('401') || msg.includes('403') || msg.includes('invalid api key') || msg.includes('unauthorized')
  // Dead/unavailable model (e.g. gemini-2.5-flash pulled early → 404
  // "no longer available to new users"): a model that cannot exist will never
  // heal on a 30s retry — long backoff, re-evaluated when the registry syncs.
  const isInvalidModel = msg.includes('404') || msg.includes('no longer available') || msg.includes('not found') || msg.includes('does not exist') || msg.includes('invalid model') || msg.includes('not_found_error')
  // Daily-quota exhaustion (RPD) resets on a wall clock, not in 30 minutes.
  const isDailyQuota = /per day|tokens per day|daily quota|requests per day/i.test(msg)
  // Honor provider-provided Retry-After (seconds) when present.
  const raMatch = /retry-after:\s*(\d+)/i.exec(errMsg)
  const retryAfterMs = raMatch ? Math.max(0, parseInt(raMatch[1], 10) * 1000) : 0

  let errorCode: string | null = null
  const codeMatch = /^[a-z_]+ (\d{3})/.exec(errMsg)
  if (codeMatch) errorCode = codeMatch[1]
  else if (/empty response/.test(msg)) errorCode = 'EMPTY_RESPONSE'

  if (isQuota || isDailyQuota) {
    // Quota-class failures: long backoff so we stop re-hammering an exhausted
    // bucket. Daily quotas get hours (they reset on a wall clock); per-minute
    // quotas get 30 min; provider Retry-After overrides both when provided.
    h.isQuotaExhausted = true
    const baseMs = isDailyQuota ? 6 * 60 * 60_000 : 30 * 60_000
    h.quotaResetAt = Date.now() + Math.max(baseMs, retryAfterMs)
    h.cooldownUntil = h.quotaResetAt
  } else if (isRateLimit) {
    h.isRateLimited = true
    h.cooldownUntil = Date.now() + Math.max(5 * 60_000, retryAfterMs)
  } else if (isInvalidModel) {
    // Dead model ID — 12h backoff (aligns with model-sync freshness window);
    // the next discovery/sync cycle is what can actually fix this.
    h.cooldownUntil = Date.now() + Math.max(12 * 60 * 60_000, retryAfterMs)
  } else if (isAuth) {
    // Key-level failure: long backoff, but never a permanent ban.
    h.cooldownUntil = Date.now() + Math.max(30 * 60_000, retryAfterMs)
  } else {
    // Generic failure: exponential cooldown 30s → 30m cap, then re-eligible.
    const backoff = Math.min(30_000 * 2 ** Math.min(h.consecutiveFailures - 1, 10), 30 * 60_000)
    h.cooldownUntil = Date.now() + Math.max(backoff, retryAfterMs)
  }
  persistHealth(providerId, errorCode)
}

/** Sync health state from DB — warms cold instances with measured history. */
export async function syncHealthFromDB(): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service")
    const supabase = createServiceClient()
    const { data } = await supabase.from("ai_orch_health").select("*")
    if (!data) return
    for (const row of data as any[]) {
      const id = row.provider as ProviderId
      if (!getProviders().some(p => p.id === id)) continue
      const h = getHealth(id)
      h.consecutiveFailures = row.consecutive_failures || 0
      h.lastFailureAt = row.last_failure_at ? new Date(row.last_failure_at).getTime() : 0
      h.lastSuccessAt = row.last_success_at ? new Date(row.last_success_at).getTime() : 0
      h.cooldownUntil = row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0
      h.isQuotaExhausted = row.is_quota_exhausted || false
      h.quotaResetAt = row.quota_reset_at ? new Date(row.quota_reset_at).getTime() : 0
      h.isRateLimited = row.is_rate_limited || false
      h.avgLatencyMs = row.avg_latency_ms || 0
      h.totalSuccesses = row.total_successes || 0
      h.totalFailures = row.total_failures || 0
      h.lastError = row.last_error_message || undefined
      if (row.task_stats && typeof row.task_stats === 'object') {
        h.taskStats = row.task_stats as Record<string, TaskStat>
      }
    }
    console.log(JSON.stringify({ scope: "smart_router", event: "health_synced", providers: (data as any[]).length }))
  } catch (e) {
    console.log(JSON.stringify({ scope: "smart_router", event: "health_sync_error", error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }))
  }
}

/** Real, live snapshot of router knowledge (replaces fabricated health stubs). */
export function getRouterHealthSnapshot(): Array<{
  id: ProviderId; enabled: boolean; healthy: boolean; gated: boolean; gateReason: string | null
  inCooldown: boolean; consecutiveFailures: number; avgLatencyMs: number; quotaExhausted: boolean
  samples: number; successRate: number | null; score: number; lastError: string
}> {
  const now = Date.now()
  return getProviders().map(cfg => {
    const h = getHealth(cfg.id)
    const gate = isGated(cfg, h, now)
    const decision = scoreProvider(cfg, undefined, now)
    const samples = h.totalSuccesses + h.totalFailures
    return {
      id: cfg.id,
      enabled: cfg.enabled,
      healthy: cfg.enabled && !gate,
      gated: gate !== null,
      gateReason: gate,
      inCooldown: now < h.cooldownUntil,
      consecutiveFailures: h.consecutiveFailures,
      avgLatencyMs: h.avgLatencyMs > 0 ? Math.round(h.avgLatencyMs) : 0,
      quotaExhausted: h.isQuotaExhausted && now < h.quotaResetAt,
      samples,
      successRate: samples > 0 ? Math.round((h.totalSuccesses / samples) * 1000) / 10 : null,
      score: Math.round(decision.score * 10) / 10,
      lastError: h.lastError || '',
    }
  })
}

/** Recent routing logs (for audit endpoint). */
export function getRoutingLogs(count: number = 50): RoutingLog[] {
  return routingLogs.slice(-count).reverse()
}

/** Routing statistics for all providers. */
export function getRoutingStats(): { providers: Array<{ id: string; name: string; model: string; score: number; healthy: boolean; reasoning: string[]; taskTypes: string[] }>; totalDecisions: number } {
  const now = Date.now()
  const providers = getProviders().map(cfg => {
    const decision = scoreProvider(cfg, undefined, now)
    const health = getHealth(cfg.id)
    const samples = health.totalSuccesses + health.totalFailures
    return {
      id: cfg.id,
      name: cfg.name,
      model: cfg.model,
      score: Math.round(decision.score * 10) / 10,
      healthy: decision.score > 0,
      reasoning: decision.reasoning,
      taskTypes: cfg.taskTypes || [],
      consecutiveFailures: health.consecutiveFailures,
      avgLatencyMs: Math.round(health.avgLatencyMs),
      samples,
      successRate: samples > 0 ? Math.round((health.totalSuccesses / samples) * 1000) / 10 : null,
      factors: decision.factors,
    }
  })
  providers.sort((a, b) => b.score - a.score)
  return { providers, totalDecisions: routingLogs.length }
}

/** Test routing across all task types — proves per-task measured routing. */
export function testRoutingAllTasks(): Record<string, { selected: string; model: string; score: number; reasoning: string[]; alternatives: string[] }> {
  const taskTypes: TaskType[] = [
    'job_intelligence', 'fast_extraction', 'cv_parsing', 'complex_analysis',
    'bulk_processing', 'code_analysis', 'edge_processing', 'european_jobs',
    'gpu_accelerated', 'simple_analysis',
  ]
  const result: Record<string, any> = {}
  for (const task of taskTypes) {
    const ranked = routeTaskAll(task)
    if (ranked.length > 0) {
      result[task] = {
        selected: ranked[0].provider.id,
        model: ranked[0].provider.model,
        score: Math.round(ranked[0].score * 10) / 10,
        reasoning: ranked[0].reasoning,
        alternatives: ranked.slice(1, 4).map(d => `${d.provider.id} (${Math.round(d.score * 10) / 10})`),
        candidates: ranked.length,
      }
    } else {
      result[task] = { selected: 'NONE', model: '', score: 0, reasoning: ['No available providers'], alternatives: [], candidates: 0 }
    }
  }
  return result
}

export { logRoutingDecision }
