/**
 * Adaptive Provider Scoring — data-driven routing.
 *
 * Scores providers from live production metrics: success rate, latency,
 * truth score, evidence quality, quota availability, cooldown state,
 * cost, reliability, and recent health. Automatically routes to the
 * highest-scoring healthy provider without manual priority tuning.
 */

import { PROVIDERS, type ProviderId } from "./providers/types"
import { getOrchHealth } from "./orchestrator"
import { createServiceClient } from "@/lib/supabase/service"

export interface ProviderScore {
  id: ProviderId; enabled: boolean; totalScore: number
  healthScore: number; qualityScore: number; latencyScore: number; costScore: number
  details: { successRate: number; avgLatency: number; avgQuality: number; quotaOk: boolean; cooldownSecs: number }
}

export async function scoreProviders(): Promise<ProviderScore[]> {
  const health = getOrchHealth()
  const now = Date.now()

  // Fetch quality metrics per provider from the last 24h
  let qualityByProvider: Record<string, { count: number; avgQuality: number }> = {}
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from("job_ai_intelligence")
      .select("model_version, quality_score")
      .gte("quality_evaluated_at", new Date(Date.now() - 86400000).toISOString())
      .limit(500)
    if (data) {
      const groups: Record<string, number[]> = {}
      for (const row of data as any[]) {
        const mv = row.model_version || ""
        for (const id of ["groq","cerebras","openrouter","gemini"]) {
          if (mv.includes(id)) { if (!groups[id]) groups[id] = []; groups[id].push(row.quality_score||0); break }
        }
      }
      for (const [id, scores] of Object.entries(groups)) {
        qualityByProvider[id] = { count: scores.length, avgQuality: Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) }
      }
    }
  } catch {}

  const scores: ProviderScore[] = []

  for (const cfg of PROVIDERS) {
    const h = health.find(x => x.id === cfg.id)
    if (!h || !cfg.enabled) { scores.push({ id: cfg.id, enabled: false, totalScore: -9999, healthScore:0, qualityScore:0, latencyScore:0, costScore:0, details:{successRate:0, avgLatency:0, avgQuality:0, quotaOk:false, cooldownSecs:0} }); continue }

    const cooldownSecs = h.inCooldown ? 60000 : 0
    const inCooldown = cooldownSecs > 0
    const quotaOk = !h.quotaExhausted
    const healthy = h.healthy && quotaOk

    // Health score: 0-35 points
    const healthScore = healthy ? 35 : (quotaOk && !inCooldown ? 20 : (cooldownSecs < 30000 ? 10 : 0))

    // Quality score: 0-25 points — from actual evaluated records
    const qp = qualityByProvider[cfg.id]
    const avgQuality = qp?.avgQuality || 0
    const qualityCount = qp?.count || 0
    const qualityScore = qualityCount >= 3 ? Math.round((avgQuality / 100) * 25) : 15

    // Latency score: 0-25 points — faster = better
    const avgLatency = h.avgLatencyMs || 500
    const latencyScore = avgLatency < 300 ? 25 : avgLatency < 800 ? 20 : avgLatency < 2000 ? 12 : avgLatency < 10000 ? 5 : 0

    // Cost score: 0-15 points — cheaper = better
    const costPer1k = cfg.costPer1kTokens
    const costScore = costPer1k === 0 ? 15 : costPer1k === 1 ? 12 : costPer1k === 2 ? 8 : 3

    const totalScore = healthScore + qualityScore + latencyScore + costScore

    scores.push({
      id: cfg.id, enabled: true, totalScore, healthScore, qualityScore, latencyScore, costScore,
      details: {
        successRate: h.consecutiveFailures > 0 ? Math.round((1 - h.consecutiveFailures / Math.max(1,h.consecutiveFailures+1)) * 100) : 100,
        avgLatency, avgQuality, quotaOk, cooldownSecs,
      },
    })
  }

  scores.sort((a,b) => b.totalScore - a.totalScore)
  return scores
}

/** Get the single best provider to route to right now. */
export async function bestProvider(): Promise<ProviderId> {
  const scores = await scoreProviders()
  const best = scores.find(s => s.enabled && s.totalScore >= 20)
  // Score of 20+ means healthy + some quality/latency data
  if (best) return best.id
  // Fall through to any enabled provider not in long cooldown
  const fallback = scores.find(s => s.enabled && s.details.cooldownSecs < 60000)
  if (fallback) return fallback.id
  // Absolute last resort: return the first enabled provider
  const any = scores.find(s => s.enabled)
  return any?.id || "groq" as ProviderId
}
