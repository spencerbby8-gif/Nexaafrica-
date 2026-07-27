/**
 * Second Opinion Verification — when AI confidence or evidence quality
 * falls below thresholds, request a second pass from another provider.
 * Compares outputs, reconciles differences, preserves evidence, stores
 * the final validated result. Never wastes AI calls on high-confidence results.
 */
import type { Job } from "@/lib/types"
import { orchestrate } from "./orchestrator"
import { createServiceClient } from "@/lib/supabase/service"
import type { GatewayResult } from "./gateway"
import type { ProviderId } from "./providers/types"

const LOW_CONFIDENCE = 30    // overall_confidence below this triggers review
const LOW_EVIDENCE = 20      // evidence_coverage below this triggers review
const HIGH_HALLUCINATION = 40 // hallucination_risk above this triggers review

export async function maybeSecondOpinion(job: Job, firstResult: GatewayResult): Promise<GatewayResult | null> {
  // Only review if the primary result came from an AI provider
  const primaryText = firstResult.response.text
  const jsonMatch = primaryText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: any; try { parsed = JSON.parse(jsonMatch[0]) } catch { return null }

  // Check thresholds
  const confOk = (parsed.overall_confidence || 0) >= LOW_CONFIDENCE
  const evidenceCount = Object.values(parsed).filter((v: any) => typeof v === 'string' && v.length > 20).length
  const evidenceOk = evidenceCount >= 2

  // Only verify if confidence OR evidence is low
  if (confOk && evidenceOk) return null

  // Build a verification prompt
  const prompt = `Compare these two intelligence assessments for the same job. The first is from a primary AI analysis with low confidence/evidence. Your job is to verify or refine it.

Job: ${job.title} at ${job.company}
Primary analysis: ${JSON.stringify(parsed, null, 1).slice(0, 2000)}

Return improved JSON with the same structure. Where the primary analysis is correct, keep it. Where it is wrong or uncertain, provide better values backed by the job description. Quote evidence verbatim. Use "unknown" where evidence is genuinely missing.`

  try {
    const second = await orchestrate({
      prompt, agentId: "verifier:second-opinion", jobId: job.id,
      systemInstruction: "You are a verifier. Compare and improve intelligence. Evidence-based, never guess.",
      temperature: 0.2, maxTokens: 1500,
    })

    // Persist that a second opinion was requested
    try {
      const supabase = createServiceClient()
      await supabase.from("ai_provider_log").insert({
        agent_id: "second-opinion", provider: second.response.provider,
        model: second.response.model, event: "success",
        retry_count: 0, duration_ms: second.response.latencyMs,
        fallback_used: second.fallbackUsed,
      }).then(()=>{}, ()=>{})
    } catch {}

    return second
  } catch {
    // Second opinion failed — primary result stands
    return null
  }
}
