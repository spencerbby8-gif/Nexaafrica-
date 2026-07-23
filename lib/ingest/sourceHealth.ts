export interface SourceRun {
  source: string
  ok: boolean
  fetched: number
  inserted: number
  skipped: number
  rejected: number
  error?: string | null
  created_at?: string
  ran_at?: string
}

export interface SourceHealth {
  source: string
  isHealthy: boolean
  lastSuccessAt: string | null
  lastRunAt: string | null
  avgFetched: number
  consecutiveFailures: number
  totalRuns: number
  lastError?: string | null
  lastFetched: number
  lastInserted: number
}

export function calculateSourceHealth(runs: SourceRun[]): SourceHealth[] {
  const grouped = new Map<string, SourceRun[]>()

  for (const r of runs) {
    const list = grouped.get(r.source) || []
    list.push(r)
    grouped.set(r.source, list)
  }

  const result: SourceHealth[] = []

  for (const [source, list] of grouped) {
    // Sort by date desc
    const sorted = [...list].sort((a, b) => {
      const da = new Date(a.created_at || a.ran_at || 0).getTime()
      const db = new Date(b.created_at || b.ran_at || 0).getTime()
      return db - da
    })

    const last = sorted[0]
    const lastRunAt = last.created_at || last.ran_at || null

    let lastSuccessAt: string | null = null
    let consecutiveFailures = 0
    let totalFetched = 0

    for (const r of sorted) {
      totalFetched += r.fetched
      if (r.ok && !lastSuccessAt) {
        lastSuccessAt = r.created_at || r.ran_at || null
      }
      // Count consecutive failures from most recent
      if (consecutiveFailures === sorted.indexOf(r) || consecutiveFailures === 0) {
        if (!r.ok) consecutiveFailures++
        else if (consecutiveFailures > 0) break
      }
    }

    // Actually compute consecutive failures correctly
    let cf = 0
    for (const r of sorted) {
      if (!r.ok) cf++
      else break
    }

    const avgFetched = sorted.length > 0 ? Math.round(totalFetched / sorted.length) : 0

    result.push({
      source,
      isHealthy: last.ok && cf < 3,
      lastSuccessAt,
      lastRunAt,
      avgFetched,
      consecutiveFailures: cf,
      totalRuns: sorted.length,
      lastError: last.ok ? null : last.error || null,
      lastFetched: last.fetched,
      lastInserted: last.inserted,
    })
  }

  return result.sort((a, b) => a.source.localeCompare(b.source))
}

export function getOverallHealth(health: SourceHealth[]) {
  const healthy = health.filter(h => h.isHealthy).length
  const failing = health.filter(h => !h.isHealthy).length
  const total = health.length
  const avgFetched = health.length > 0 ? Math.round(health.reduce((acc, h) => acc + h.avgFetched, 0) / health.length) : 0

  return {
    total,
    healthy,
    failing,
    healthPercent: total > 0 ? Math.round((healthy / total) * 100) : 0,
    avgFetched,
  }
}
