import type { Job } from "@/lib/types"
import { orchestrate } from "./orchestrator"
import { createServiceClient } from "@/lib/supabase/service"
import type { GatewayResult } from "./gateway"
import { evaluateIntelligence } from "./quality"

const LOW_CONFIDENCE = 30
const LOW_EVIDENCE_COV = 20
const HIGH_HALLUCINATION = 40

/** Decides whether a second opinion is needed for a completed job */
export function shouldVerify(first: any): { needed: boolean; reason: string } {
  const q = evaluateIntelligence({
    africa_eligibility: first.africa_eligibility,
    africa_evidence: first.africa_evidence,
    africa_confidence: first.africa_confidence,
    remote_eligibility: first.remote_eligibility,
    remote_evidence: first.remote_evidence,
    remote_confidence: first.remote_confidence,
    salary_transparency: first.salary_transparency,
    salary_evidence: first.salary_evidence,
    salary_confidence: first.salary_confidence,
    company_legitimacy: first.company_legitimacy,
    company_evidence: first.company_evidence,
    company_confidence: first.company_confidence,
    experience_level: first.experience_level,
    experience_confidence: first.experience_confidence,
    job_quality: first.job_quality,
    job_quality_evidence: first.job_quality_evidence,
    job_quality_confidence: first.job_quality_confidence,
    required_skills: first.required_skills,
  })

  if (q.overallQuality < LOW_CONFIDENCE) return { needed: true, reason: `low quality: ${q.overallQuality}` }
  if (q.evidenceCoverage < LOW_EVIDENCE_COV) return { needed: true, reason: `low evidence: ${q.evidenceCoverage}%` }
  if (q.hallucinationRisk > HIGH_HALLUCINATION) return { needed: true, reason: `hallucination risk: ${q.hallucinationRisk}%` }
  if (q.missingFields >= 4) return { needed: true, reason: `missing fields: ${q.missingFields}` }
  return { needed: false, reason: `quality ok: ${q.overallQuality}` }
}

/** Obtain a second opinion and return reconciled result */
export async function getSecondOpinion(
  job: Job, firstResult: { ai: any; modelVersion: string; diags: any[] }
): Promise<{ used: boolean; provider?: string; reconciled?: any; auditNote: string }> {
  const check = shouldVerify(firstResult.ai)
  if (!check.needed) return { used: false, auditNote: check.reason }

  // Build verification prompt
  const prompt = `Verify this job intelligence. Fix errors, strengthen evidence, reduce unknowns.
  
Previous analysis (provider: ${firstResult.modelVersion}):
${JSON.stringify(firstResult.ai, null, 1).slice(0, 3000)}

Return improved JSON with the SAME structure. Keep correct values. Fix weak/uncertain ones.
Quote verbatim evidence from the description. Never invent facts. Use \"unknown\" only when
evidence is truly missing.`

  try {
    const second = await orchestrate({
      prompt, agentId: "verifier:second-opinion", jobId: job.id,
      systemInstruction: "Verify and improve job intelligence. Evidence-based. Never guess. Output only JSON.",
      temperature: 0.15, maxTokens: 1500,
    })

    const m = second.response.text.match(/\{[\s\S]*\}/)
    if (!m) return { used: true, auditNote: `second opinion requested but unparseable from ${second.response.provider}` }

    const reconciled = JSON.parse(m[0])
    // Persist the dual-provider audit
    try {
      const supabase = createServiceClient()
      const rows: Record<string, unknown>[] = [{
        agent_id: "second-opinion", provider: second.response.provider,
        model: second.response.model, event: "success",
        retry_count: 0, duration_ms: second.response.latencyMs, fallback_used: second.fallbackUsed,
      }]
      // [RELIABILITY] False-success prevention: the FIRST analysis must only be
      // recorded as a provider success when it actually used a real AI provider
      // (modelVersion is "provider:model"). Regex/rule fallbacks ("regex-extracted-…",
      // "no-ai-providers", "failed-no-evidence") are logged honestly as
      // event="fallback" — production had hundreds of fake success rows here.
      const firstProvider = firstResult.modelVersion.split(":")[0]
      const firstWasAI = firstResult.modelVersion.includes(":") && !firstResult.modelVersion.startsWith("regex-") && !firstResult.modelVersion.startsWith("failed-") && !firstResult.modelVersion.startsWith("no-ai")
      rows.push({
        agent_id: "second-opinion", provider: firstProvider || "none",
        model: firstResult.modelVersion,
        event: firstWasAI ? "success" : "fallback",
        retry_count: 0, duration_ms: 0, fallback_used: !firstWasAI,
      })
      await supabase.from("ai_provider_log").insert(rows).then(()=>{},()=>{})
    } catch {}

    return { used: true, provider: second.response.provider, reconciled, auditNote: `verified by ${second.response.provider}` }
  } catch (e: any) {
    return { used: false, auditNote: `second opinion failed: ${e?.message?.slice(0,100) || "unknown"}` }
  }
}
