/**
 * Smart AI Router — Production Pipeline
 * 
 * Routes every AI request to the best provider based on:
 * 1. Task capability (does provider support this task type?)
 * 2. Health score (consecutive failures, cooldown, quota)
 * 3. Benchmark / historical performance (latency, success rate)
 * 4. Priority (configured preference)
 * 5. Cost (prefer cheaper when scores are similar)
 * 
 * Every routing decision is logged with full reasoning.
 * This router is the SINGLE ENTRY POINT for all model selection.
 */

import { PROVIDERS, type ProviderId, type ProviderConfig } from "./providers/types"

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
  taskCapability: number     // 0-40 points
  healthScore: number        // 0-25 points
  performanceScore: number   // 0-20 points
  priorityScore: number      // 0-10 points
  costScore: number          // 0-5 points
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

// ─── In-memory health state (mirrors orchestrator but used for routing) ──

interface ProviderHealthState {
  consecutiveFailures: number
  lastFailureAt: number
  lastSuccessAt: number
  cooldownUntil: number
  isQuotaExhausted: boolean
  quotaResetAt: number
  isRateLimited: boolean
  avgLatencyMs: number
  totalRequests: number
  totalFailures: number
  successRate: number
}

const healthState = new Map<ProviderId, ProviderHealthState>()

function getHealth(id: ProviderId): ProviderHealthState {
  if (!healthState.has(id)) {
    healthState.set(id, {
      consecutiveFailures: 0, lastFailureAt: 0, lastSuccessAt: 0,
      cooldownUntil: 0, isQuotaExhausted: false, quotaResetAt: 0,
      isRateLimited: false, avgLatencyMs: 0, totalRequests: 0,
      totalFailures: 0, successRate: 100,
    })
  }
  return healthState.get(id)!
}

// ─── Routing log buffer ─────────────────────────────────────────

const routingLogs: RoutingLog[] = []
const MAX_LOGS = 500

function logRoutingDecision(log: RoutingLog): void {
  routingLogs.push(log)
  if (routingLogs.length > MAX_LOGS) routingLogs.shift()
  // Also emit to console for Vercel logs
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

function scoreProvider(
  cfg: ProviderConfig,
  taskType: TaskType | undefined,
  now: number,
): RoutingDecision {
  const health = getHealth(cfg.id)
  const reasoning: string[] = []

  // ── Gate checks (instant -9999 if blocked) ──
  if (!cfg.enabled) {
    return { provider: cfg, score: -9999, reasoning: ['Disabled'], factors: { taskCapability: 0, healthScore: 0, performanceScore: 0, priorityScore: 0, costScore: 0 } }
  }

  const inCooldown = now < health.cooldownUntil
  if (inCooldown) {
    const remaining = Math.ceil((health.cooldownUntil - now) / 1000)
    return { provider: cfg, score: -9999, reasoning: [`In cooldown (${remaining}s remaining)`], factors: { taskCapability: 0, healthScore: 0, performanceScore: 0, priorityScore: 0, costScore: 0 } }
  }

  const quotaBlocked = health.isQuotaExhausted && now < health.quotaResetAt
  if (quotaBlocked) {
    return { provider: cfg, score: -9999, reasoning: ['Quota exhausted'], factors: { taskCapability: 0, healthScore: 0, performanceScore: 0, priorityScore: 0, costScore: 0 } }
  }

  if (health.isRateLimited && now < health.cooldownUntil) {
    return { provider: cfg, score: -9999, reasoning: ['Rate limited'], factors: { taskCapability: 0, healthScore: 0, performanceScore: 0, priorityScore: 0, costScore: 0 } }
  }

  // ── Factor 1: Task Capability (0-40 points) ──
  let taskCapability = 0
  if (taskType) {
    if (cfg.taskTypes && cfg.taskTypes.length > 0) {
      if (cfg.taskTypes.includes(taskType)) {
        taskCapability = 40
        reasoning.push(`✓ Supports task "${taskType}"`)
      } else if (cfg.taskTypes.includes('fallback')) {
        taskCapability = 15
        reasoning.push(`Fallback provider (not optimized for "${taskType}")`)
      } else {
        taskCapability = 5
        reasoning.push(`No task affinity for "${taskType}" (will still try)`)
      }
    } else {
      // No taskTypes defined = general purpose
      taskCapability = 20
      reasoning.push('General purpose (no task restriction)')
    }
  } else {
    taskCapability = 25
    reasoning.push('No task type specified (default capability)')
  }

  // ── Factor 2: Health (0-25 points) ──
  let healthScore = 25 // Start perfect
  if (health.consecutiveFailures > 0) {
    healthScore -= Math.min(health.consecutiveFailures * 8, 25)
    reasoning.push(`${health.consecutiveFailures} consecutive failure(s)`)
  }
  if (health.successRate < 80) {
    healthScore -= Math.round((100 - health.successRate) / 5)
    reasoning.push(`Success rate: ${health.successRate.toFixed(1)}%`)
  } else if (health.totalRequests > 0) {
    reasoning.push(`Success rate: ${health.successRate.toFixed(1)}%`)
  }
  healthScore = Math.max(0, healthScore)

  // ── Factor 3: Performance / Latency (0-20 points) ──
  let performanceScore = 10 // Default if no data
  if (health.avgLatencyMs > 0) {
    if (health.avgLatencyMs < 500) {
      performanceScore = 20
      reasoning.push(`Fast: ${health.avgLatencyMs}ms avg`)
    } else if (health.avgLatencyMs < 1500) {
      performanceScore = 15
      reasoning.push(`OK latency: ${health.avgLatencyMs}ms avg`)
    } else if (health.avgLatencyMs < 5000) {
      performanceScore = 8
      reasoning.push(`Slow: ${health.avgLatencyMs}ms avg`)
    } else {
      performanceScore = 3
      reasoning.push(`Very slow: ${health.avgLatencyMs}ms avg`)
    }
  } else {
    reasoning.push('No latency data (untested)')
  }

  // ── Factor 4: Priority (0-10 points) ──
  const priorityScore = Math.max(0, 10 - (cfg.priority - 1))
  reasoning.push(`Priority: ${cfg.priority}/10`)

  // ── Factor 5: Cost (0-5 points, cheaper = better) ──
  let costScore = 3
  if (cfg.costPer1kTokens === 0) {
    costScore = 5
    reasoning.push('Free tier')
  } else if (cfg.costPer1kTokens <= 1) {
    costScore = 4
    reasoning.push(`Low cost: $${cfg.costPer1kTokens}/1k`)
  } else if (cfg.costPer1kTokens <= 2) {
    costScore = 3
    reasoning.push(`Medium cost: $${cfg.costPer1kTokens}/1k`)
  } else {
    costScore = 1
    reasoning.push(`High cost: $${cfg.costPer1kTokens}/1k`)
  }

  const totalScore = taskCapability + healthScore + performanceScore + priorityScore + costScore

  return {
    provider: cfg,
    score: totalScore,
    reasoning,
    factors: { taskCapability, healthScore, performanceScore, priorityScore, costScore },
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Route to the best provider for a task.
 * Returns the top-ranked decision.
 */
export function routeTask(taskType?: TaskType): RoutingDecision | null {
  const now = Date.now()
  const decisions = PROVIDERS.map(cfg => scoreProvider(cfg, taskType, now))
  decisions.sort((a, b) => b.score - a.score)
  const best = decisions[0]
  if (!best || best.score <= 0) return null
  return best
}

/**
 * Get all providers ranked for a task (for failover chain).
 */
export function routeTaskAll(taskType?: TaskType): RoutingDecision[] {
  const now = Date.now()
  const decisions = PROVIDERS.map(cfg => scoreProvider(cfg, taskType, now))
  decisions.sort((a, b) => b.score - a.score)
  return decisions.filter(d => d.score > 0)
}

/**
 * Record a successful provider call — updates routing health.
 */
export function recordRouterSuccess(providerId: ProviderId, latencyMs: number): void {
  const h = getHealth(providerId)
  h.consecutiveFailures = 0
  h.lastSuccessAt = Date.now()
  h.totalRequests++
  h.avgLatencyMs = h.avgLatencyMs > 0
    ? Math.round(h.avgLatencyMs * 0.7 + latencyMs * 0.3)
    : latencyMs
  h.isQuotaExhausted = false
  h.isRateLimited = false
  h.cooldownUntil = 0
  h.successRate = h.totalRequests > 0
    ? ((h.totalRequests - h.totalFailures) / h.totalRequests) * 100
    : 100
}

/**
 * Record a failed provider call — updates routing health + cooldown.
 */
export function recordRouterFailure(providerId: ProviderId, errMsg: string): void {
  const h = getHealth(providerId)
  h.consecutiveFailures++
  h.lastFailureAt = Date.now()
  h.totalRequests++
  h.totalFailures++
  h.successRate = h.totalRequests > 0
    ? ((h.totalRequests - h.totalFailures) / h.totalRequests) * 100
    : 0

  // Classify error for cooldown
  const msg = errMsg.toLowerCase()
  const isQuota = msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota exceeded')
  const isRateLimit = msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('tokens per day')
  const isAuth = msg.includes('401') || msg.includes('403') || msg.includes('invalid api key')

  if (isQuota) {
    h.isQuotaExhausted = true
    h.quotaResetAt = Date.now() + 60_000
    h.cooldownUntil = h.quotaResetAt
  } else if (isRateLimit) {
    h.isRateLimited = true
    h.cooldownUntil = Date.now() + 120_000
  } else if (isAuth) {
    h.cooldownUntil = Date.now() + 300_000
  } else {
    h.cooldownUntil = Date.now() + Math.min(2 ** h.consecutiveFailures * 2000, 300_000)
  }
}

/**
 * Sync health state from the orchestrator's DB-persisted health.
 * Called at startup and periodically.
 */
export async function syncHealthFromDB(): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service")
    const supabase = createServiceClient()
    const { data } = await supabase.from("ai_orch_health").select("*")
    if (!data) return
    for (const row of data as any[]) {
      const id = row.provider as ProviderId
      const h = getHealth(id)
      h.consecutiveFailures = row.consecutive_failures || 0
      h.lastFailureAt = row.last_failure_at ? new Date(row.last_failure_at).getTime() : 0
      h.lastSuccessAt = row.last_success_at ? new Date(row.last_success_at).getTime() : 0
      h.cooldownUntil = row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0
      h.isQuotaExhausted = row.is_quota_exhausted || false
      h.quotaResetAt = row.quota_reset_at ? new Date(row.quota_reset_at).getTime() : 0
      h.isRateLimited = row.is_rate_limited || false
      h.avgLatencyMs = row.avg_latency_ms || 0
      const successes = row.total_successes || 0
      const failures = row.total_failures || 0
      h.totalRequests = successes + failures
      h.totalFailures = failures
      h.successRate = h.totalRequests > 0 ? (successes / h.totalRequests) * 100 : 100
    }
    console.log(JSON.stringify({ scope: "smart_router", event: "health_synced", providers: data.length }))
  } catch (e) {
    console.log(JSON.stringify({ scope: "smart_router", event: "health_sync_error", error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }))
  }
}

/**
 * Get recent routing logs (for audit endpoint).
 */
export function getRoutingLogs(count: number = 50): RoutingLog[] {
  return routingLogs.slice(-count).reverse()
}

/**
 * Get routing statistics.
 */
export function getRoutingStats(): { providers: Array<{ id: string; name: string; model: string; score: number; healthy: boolean; reasoning: string[]; taskTypes: string[] }>; totalDecisions: number } {
  const now = Date.now()
  const providers = PROVIDERS.map(cfg => {
    const decision = scoreProvider(cfg, undefined, now)
    const health = getHealth(cfg.id)
    return {
      id: cfg.id,
      name: cfg.name,
      model: cfg.model,
      score: Math.round(decision.score * 10) / 10,
      healthy: decision.score > 0,
      reasoning: decision.reasoning,
      taskTypes: cfg.taskTypes || [],
      consecutiveFailures: health.consecutiveFailures,
      avgLatencyMs: health.avgLatencyMs,
      successRate: health.successRate,
    }
  })
  providers.sort((a, b) => b.score - a.score)
  return { providers, totalDecisions: routingLogs.length }
}

/**
 * Test routing across all task types — proves different tasks route differently.
 */
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
      }
    } else {
      result[task] = { selected: 'NONE', model: '', score: 0, reasoning: ['No available providers'], alternatives: [] }
    }
  }
  return result
}

// Export logRoutingDecision for use by the orchestrator
export { logRoutingDecision }
