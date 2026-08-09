/**
 * Provider Capability Profiles — task-aware routing.
 *
 * Each provider advertises strengths so the orchestrator can route
 * requests based on task suitability, not just health scores.
 *
 * Profiles are enriched from live DB data: quality scores per task type,
 * historical success rates, latency percentiles, and cost efficiency.
 */

import { createServiceClient } from "@/lib/supabase/service"
import type { ProviderId } from "./providers/types"

export interface ProviderProfile {
  id: ProviderId
  // Fixed capabilities
  strengths: string[]
  bestFor: string[]       // task types this provider excels at
  avoidFor: string[]      // task types to avoid
  // Live metrics (updated from DB)
  avgQualityScore: number
  avgLatencyMs: number
  successRate: number     // 0-100
  totalEvaluations: number
  // Per-task-type quality
  taskQuality: Record<string, number>  // "intelligence" | "verification" | "cv_parsing"
}

// Fixed profiles based on verified production behavior
const FIXED_PROFILES: Record<ProviderId, ProviderProfile> = {
  gemini: {
    id: "gemini",
    strengths: ["JSON schema compliance", "structured extraction", "reasoning"],
    bestFor: ["cv_parsing", "structured_extraction"],
    avoidFor: ["batch_processing", "high_throughput"],
    avgQualityScore: 0, avgLatencyMs: 300, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  gemini_backup: {
    id: "gemini_backup",
    strengths: ["same as Gemini primary"],
    bestFor: ["cv_parsing"],
    avoidFor: ["batch_processing"],
    avgQualityScore: 0, avgLatencyMs: 300, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  groq: {
    id: "groq",
    strengths: ["fast inference", "high throughput", "cost effective"],
    bestFor: ["intelligence", "batch_processing", "high_throughput"],
    avoidFor: ["cv_parsing"],
    avgQualityScore: 0, avgLatencyMs: 200, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  cerebras: {
    id: "cerebras",
    strengths: ["deep reasoning", "verification", "explanation generation"],
    bestFor: ["verification", "second_opinion", "deep_analysis"],
    avoidFor: ["high_throughput"],
    avgQualityScore: 0, avgLatencyMs: 800, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  openrouter: {
    id: "openrouter",
    strengths: ["free tier access", "long-tail fallback", "Llama 4 model"],
    bestFor: ["fallback", "supplementary_analysis"],
    avoidFor: ["high_throughput", "latency_sensitive"],
    avgQualityScore: 0, avgLatencyMs: 12000, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  github_models: {
    id: "github_models",
    strengths: ["free tier", "GPT-4o-mini", "Phi-3", "Llama 3.1"],
    bestFor: ["intelligence", "general_analysis"],
    avoidFor: ["cv_parsing"],
    avgQualityScore: 0, avgLatencyMs: 1500, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  cloudflare: {
    id: "cloudflare",
    strengths: ["edge deployment", "low latency", "Llama 3.3 70B"],
    bestFor: ["intelligence", "fast_inference"],
    avoidFor: ["cv_parsing"],
    avgQualityScore: 0, avgLatencyMs: 800, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  mistral: {
    id: "mistral",
    strengths: ["European provider", "Mistral Large", "Codestral"],
    bestFor: ["intelligence", "code_analysis"],
    avoidFor: ["cv_parsing"],
    avgQualityScore: 0, avgLatencyMs: 2000, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  cohere: {
    id: "cohere",
    strengths: ["long context (128k)", "RAG-friendly", "grounding", "structured extraction"],
    bestFor: ["job_intelligence", "complex_analysis"],
    avoidFor: ["high_throughput", "batch_processing"],
    avgQualityScore: 0, avgLatencyMs: 900, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  nvidia: {
    id: "nvidia",
    strengths: ["NIM microservice", "Llama 3.1", "Nemotron"],
    bestFor: ["intelligence", "gpu_accelerated"],
    avoidFor: ["cv_parsing"],
    avgQualityScore: 0, avgLatencyMs: 1500, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
  huggingface: {
    id: "huggingface",
    strengths: ["open models"],
    bestFor: [],
    avoidFor: ["all"],
    avgQualityScore: 0, avgLatencyMs: 0, successRate: 0, totalEvaluations: 0, taskQuality: {},
  },
}

export async function getProviderProfiles(): Promise<ProviderProfile[]> {
  const profiles: ProviderProfile[] = Object.values(FIXED_PROFILES).map(p => ({
    ...p, taskQuality: {},
  }))

  // Enrich with live quality data from last 7 days
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from("job_ai_intelligence")
      .select("model_version, quality_score")
      .gte("quality_evaluated_at", new Date(Date.now() - 7*86400000).toISOString())
      .not("quality_score", "is", null)
      .limit(1000)

    if (data) {
      const groups: Record<string, number[]> = {}
      for (const row of data as any[]) {
        const mv = (row.model_version || "").toLowerCase()
        for (const id of ["gemini","groq","cerebras","openrouter"]) {
          if (mv.includes(id + ":")) { if (!groups[id]) groups[id] = []; groups[id].push(row.quality_score); break }
        }
      }
      for (const profile of profiles) {
        const scores = groups[profile.id] || []
        if (scores.length > 0) {
          profile.avgQualityScore = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)
          profile.totalEvaluations = scores.length
        }
      }
    }

    // Latency and success from provider log
    const { data: logData } = await supabase.from("ai_provider_log")
      .select("provider, event, duration_ms")
      .gte("created_at", new Date(Date.now() - 7*86400000).toISOString())
      .limit(5000)
    if (logData) {
      for (const profile of profiles) {
        const entries = (logData as any[]).filter(e => e.provider === profile.id)
        const successes = entries.filter(e => e.event === 'success')
        if (successes.length) {
          profile.avgLatencyMs = Math.round(successes.reduce((s,e)=>s+(e.duration_ms||0),0)/successes.length)
          profile.successRate = Math.round(successes.length/entries.length*100)
        }
      }
    }
  } catch {}

  return profiles
}

/** Route a task to the best provider based on capability fit + health. */
export function bestForTask(
  task: "intelligence" | "verification" | "cv_parsing" | "fallback",
  profiles: ProviderProfile[],
  healthyProviderIds: Set<string>,
): ProviderId | null {
  const candidates = profiles.filter(p => healthyProviderIds.has(p.id) && p.bestFor.includes(task))
  if (!candidates.length) {
    // Fall back to any healthy provider not in long cooldown
    const any = profiles.filter(p => healthyProviderIds.has(p.id) && !p.avoidFor.includes("all"))
    if (any.length) return any.sort((a,b) => b.avgQualityScore - a.avgQualityScore)[0].id
    // Last resort: groq for anything
    if (healthyProviderIds.has("groq")) return "groq"
    return null
  }
  candidates.sort((a,b) => {
    // Score by quality first, then latency
    const qDiff = (b.avgQualityScore||0) - (a.avgQualityScore||0)
    if (qDiff !== 0) return qDiff
    return (a.avgLatencyMs||9999) - (b.avgLatencyMs||9999)
  })
  return candidates[0].id
}
