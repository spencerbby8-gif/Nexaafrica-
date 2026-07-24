import { PROVIDERS, type ProviderConfig, type ProviderHealth, type ProviderId } from "./types"

interface HealthRecord {
  totalRequests: number
  failedRequests: number
  consecutiveFailures: number
  lastSuccessAt: string | null
  lastFailedAt: string | null
  lastError?: string
  latencies: number[]
}

// In-memory health tracking (would be DB in production, but in-memory for now with persistence via logs)
const healthMap = new Map<ProviderId, HealthRecord>()

function getRecord(id: ProviderId): HealthRecord {
  if (!healthMap.has(id)) {
    healthMap.set(id, {
      totalRequests: 0,
      failedRequests: 0,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailedAt: null,
      latencies: [],
    })
  }
  return healthMap.get(id)!
}

export function recordSuccess(id: ProviderId, latencyMs: number) {
  const rec = getRecord(id)
  rec.totalRequests++
  rec.consecutiveFailures = 0
  rec.lastSuccessAt = new Date().toISOString()
  rec.latencies.push(latencyMs)
  if (rec.latencies.length > 20) rec.latencies.shift()
}

export function recordFailure(id: ProviderId, error: string) {
  const rec = getRecord(id)
  rec.totalRequests++
  rec.failedRequests++
  rec.consecutiveFailures++
  rec.lastFailedAt = new Date().toISOString()
  rec.lastError = error.slice(0,500)
}

export function getProviderHealth(id: ProviderId): ProviderHealth {
  const rec = getRecord(id)
  const cfg = PROVIDERS.find(p => p.id === id)!
  const failureRate = rec.totalRequests > 0 ? Math.round((rec.failedRequests / rec.totalRequests) * 100) : 0
  const avgLatency = rec.latencies.length > 0 ? Math.round(rec.latencies.reduce((a,b)=>a+b,0)/rec.latencies.length) : null
  const isHealthy = rec.consecutiveFailures < 3 && failureRate < 50 && cfg.enabled

  return {
    id,
    isHealthy,
    lastSuccessAt: rec.lastSuccessAt,
    lastFailedAt: rec.lastFailedAt,
    consecutiveFailures: rec.consecutiveFailures,
    totalRequests: rec.totalRequests,
    failedRequests: rec.failedRequests,
    failureRate,
    avgLatencyMs: avgLatency,
    lastError: rec.lastError,
    enabled: cfg.enabled,
  }
}

export function getAllProviderHealth(): ProviderHealth[] {
  return PROVIDERS.map(p => getProviderHealth(p.id)).sort((a,b) => {
    // Sort by priority, but unhealthy last
    const aCfg = PROVIDERS.find(x=>x.id===a.id)!
    const bCfg = PROVIDERS.find(x=>x.id===b.id)!
    if (a.isHealthy && !b.isHealthy) return -1
    if (!a.isHealthy && b.isHealthy) return 1
    return aCfg.priority - bCfg.priority
  })
}

export function getHealthyProviders(): ProviderConfig[] {
  const health = getAllProviderHealth()
  return health.filter(h => h.isHealthy).map(h => PROVIDERS.find(p=>p.id===h.id)!).filter(Boolean) as ProviderConfig[]
}

export function shouldAutoDisable(id: ProviderId): boolean {
  const rec = getRecord(id)
  return rec.consecutiveFailures >= 5
}
