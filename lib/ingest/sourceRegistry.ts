import type { IngestSource } from "./companies"
import { INGEST_SOURCES } from "./companies"
import { REMOTE_BOARD_SOURCES } from "./remoteBoards"
import { calculateSourceHealth, type SourceRun, type SourceHealth } from "./sourceHealth"

export type ConnectorHealthStatus = "healthy" | "degraded" | "failing" | "disabled" | "unknown"

export interface ConnectorRegistryEntry {
  id: string // e.g. greenhouse:airbnb or remoteok:api
  name: string
  company: string
  ats: string
  category: "ats" | "remote_board" | "aggregator"
  quality: "premium" | "verified" | "standard" | "experimental"
  enabled: boolean
  trustScore: number
  // Health
  healthStatus: ConnectorHealthStatus
  lastSuccessfulSync: string | null
  lastFailedSync: string | null
  jobsFetched: number // last run
  jobsAccepted: number // inserted
  jobsRejected: number
  avgResponseTimeMs: number | null
  failureRate: number // 0-100
  consecutiveFailures: number
  // Metrics
  remotePercentage: number // 0-100
  salaryCoverage: number // 0-100
  africaFriendlinessScore: number // 0-10
  reliabilityScore: number // 0-10
  trustLevel: "high" | "medium" | "low"
  maintenanceTier: "low" | "medium" | "high"
  // Daily contribution
  dailyContribution?: number
  // Timestamps
  lastRunAt: string | null
  createdAt: string
}

function healthStatusFromFailures(consecutiveFailures: number, ok: boolean, fetched: number): ConnectorHealthStatus {
  if (consecutiveFailures >= 5) return "disabled"
  if (!ok) return "failing"
  if (consecutiveFailures >= 2) return "degraded"
  if (fetched === 0) return "degraded"
  return "healthy"
}

function buildRegistryEntry(
  source: { id: string; company?: string; ats?: string; trustScore?: number; enabled?: boolean },
  runs: SourceRun[],
  extra: Partial<ConnectorRegistryEntry> = {}
): ConnectorRegistryEntry {
  const relevantRuns = runs.filter(r => r.source === source.id)
  const sorted = [...relevantRuns].sort((a,b) => new Date(b.created_at || b.ran_at || 0).getTime() - new Date(a.created_at || a.ran_at || 0).getTime())
  const last = sorted[0]
  const lastSuccess = sorted.find(r => r.ok)
  const lastFail = sorted.find(r => !r.ok)

  const totalFetched = relevantRuns.reduce((acc, r) => acc + r.fetched, 0)
  const totalAccepted = relevantRuns.reduce((acc, r) => acc + r.inserted, 0)
  const totalRejected = relevantRuns.reduce((acc, r) => acc + r.rejected, 0)
  const totalRuns = relevantRuns.length
  const failedRuns = relevantRuns.filter(r => !r.ok).length
  const failureRate = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0

  let consecutiveFailures = 0
  for (const r of sorted) {
    if (!r.ok) consecutiveFailures++
    else break
  }

  const healthStatus = last ? healthStatusFromFailures(consecutiveFailures, last.ok, last.fetched) : "unknown"

  // Auto-disable logic: if 5+ consecutive failures, mark disabled (but don't actually disable in code, just status)
  const shouldAutoDisable = consecutiveFailures >= 5

  return {
    id: source.id,
    name: extra.name || (source as any).company || source.id,
    company: (source as any).company || extra.company || source.id,
    ats: (source as any).ats || source.id.split(':')[0],
    category: (extra.category as any) || "ats",
    quality: (extra.quality as any) || "verified",
    enabled: (source as any).enabled ?? true,
    trustScore: source.trustScore || extra.trustScore || 70,
    healthStatus: shouldAutoDisable ? "disabled" : healthStatus,
    lastSuccessfulSync: lastSuccess?.created_at || lastSuccess?.ran_at || null,
    lastFailedSync: lastFail?.created_at || lastFail?.ran_at || null,
    jobsFetched: last?.fetched ?? 0,
    jobsAccepted: last?.inserted ?? 0,
    jobsRejected: last?.rejected ?? 0,
    avgResponseTimeMs: null, // would need timing from run, not yet tracked, placeholder
    failureRate,
    consecutiveFailures,
    remotePercentage: extra.remotePercentage ?? 100,
    salaryCoverage: extra.salaryCoverage ?? 20,
    africaFriendlinessScore: extra.africaFriendlinessScore ?? 6,
    reliabilityScore: extra.reliabilityScore ?? 7,
    trustLevel: extra.trustLevel || (source.trustScore && source.trustScore >= 85 ? "high" : source.trustScore && source.trustScore >= 70 ? "medium" : "low"),
    maintenanceTier: extra.maintenanceTier || "low",
    dailyContribution: last?.inserted || 0,
    lastRunAt: last?.created_at || last?.ran_at || null,
    createdAt: new Date().toISOString(),
  }
}

export function buildSourceRegistry(runs: SourceRun[]): ConnectorRegistryEntry[] {
  // Build from INGEST_SOURCES + REMOTE_BOARD_SOURCES
  const allSources = [
    ...INGEST_SOURCES.map(s => ({
      id: `${s.ats}:${s.slug}`,
      company: s.company,
      ats: s.ats,
      trustScore: s.ats === 'ashby' || s.ats === 'greenhouse' ? 90 : 70,
      enabled: true,
      category: 'ats' as const,
      quality: (s.ats === 'ashby' || s.ats === 'greenhouse' ? 'premium' : 'verified') as any,
      remotePercentage: 40,
      salaryCoverage: s.ats === 'ashby' ? 40 : 15,
      africaFriendlinessScore: s.company.toLowerCase().includes('gitlab') || s.company.toLowerCase().includes('zapier') ? 9 : 6,
      reliabilityScore: 8,
      trustLevel: 'high' as const,
      maintenanceTier: 'low' as const,
    })),
    ...REMOTE_BOARD_SOURCES.map(s => ({
      id: s.id,
      company: s.name,
      ats: s.kind,
      trustScore: s.trustScore,
      enabled: s.enabled,
      category: 'remote_board' as const,
      quality: 'verified' as const,
      remotePercentage: 100,
      salaryCoverage: s.id.includes('himalayas') ? 40 : s.id.includes('remoteok') ? 35 : 20,
      africaFriendlinessScore: 9,
      reliabilityScore: 8,
      trustLevel: 'high' as const,
      maintenanceTier: 'low' as const,
    }))
  ]

  return allSources.map(s => buildRegistryEntry(s, runs, {
    name: s.company,
    company: s.company,
    category: s.category,
    quality: s.quality,
    remotePercentage: s.remotePercentage,
    salaryCoverage: s.salaryCoverage,
    africaFriendlinessScore: s.africaFriendlinessScore,
    reliabilityScore: s.reliabilityScore,
    trustLevel: s.trustLevel,
    maintenanceTier: s.maintenanceTier,
  }))
}

export function getAcquisitionReport(registry: ConnectorRegistryEntry[], runs: SourceRun[]) {
  const enabled = registry.filter(r => r.enabled && r.healthStatus !== 'disabled')
  const disabled = registry.filter(r => !r.enabled || r.healthStatus === 'disabled')
  const healthy = registry.filter(r => r.healthStatus === 'healthy')
  const failing = registry.filter(r => r.healthStatus === 'failing')
  const degraded = registry.filter(r => r.healthStatus === 'degraded')

  const totalFetched = runs.reduce((acc, r) => acc + r.fetched, 0)
  const totalAccepted = runs.reduce((acc, r) => acc + r.inserted, 0)
  const totalRejected = runs.reduce((acc, r) => acc + r.rejected, 0)
  const acceptanceRate = totalFetched > 0 ? Math.round((totalAccepted / totalFetched) * 100) : 0

  const topPerforming = [...registry].sort((a,b) => b.jobsFetched - a.jobsFetched).slice(0,5)
  const slowConnectors: ConnectorRegistryEntry[] = [] // would need avgResponseTime tracking

  // Coverage by category
  const byCategory: Record<string, number> = {}
  for (const r of registry) {
    // Approximate category from company/tags - for report, group by ats for now
    byCategory[r.ats] = (byCategory[r.ats] || 0) + r.jobsFetched
  }

  // Rejection reasons would need to be tracked in ingest_runs error field, placeholder
  const rejectionReasons: Record<string, number> = {}
  for (const r of runs) {
    if (r.error) {
      rejectionReasons[r.error.slice(0,50)] = (rejectionReasons[r.error.slice(0,50)] || 0) + 1
    }
  }

  return {
    summary: {
      totalConnectors: registry.length,
      enabled: enabled.length,
      disabled: disabled.length,
      healthy: healthy.length,
      failing: failing.length,
      degraded: degraded.length,
      totalFetched,
      totalAccepted,
      totalRejected,
      acceptanceRate,
      avgTrustScore: Math.round(registry.reduce((acc, r) => acc + r.trustScore, 0) / registry.length),
      avgAfricaFriendliness: Math.round(registry.reduce((acc, r) => acc + r.africaFriendlinessScore, 0) / registry.length * 10) / 10,
    },
    healthyConnectors: healthy.map(r => r.id),
    deadConnectors: [...disabled, ...failing].map(r => ({ id: r.id, reason: `failures=${r.consecutiveFailures} lastError=${r.lastFailedSync}`, lastSuccess: r.lastSuccessfulSync })),
    jobsFetchedPerSource: registry.map(r => ({ id: r.id, fetched: r.jobsFetched, accepted: r.jobsAccepted, rejected: r.jobsRejected, trustScore: r.trustScore })),
    acceptanceRate,
    rejectionReasons,
    slowConnectors,
    topPerforming: topPerforming.map(r => ({ id: r.id, fetched: r.jobsFetched, company: r.company })),
    byCategory,
    dailyContribution: registry.reduce((acc, r) => acc + (r.dailyContribution || 0), 0),
    registry,
  }
}
