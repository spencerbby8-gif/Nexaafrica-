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

  // Disabled until the second reviewer receives the same immutable source packet,
  // passes quote/eligibility validation and records its own provider/model history.
  return {used:false,auditNote:'Second opinion unavailable: source-grounded reconciliation not implemented'}
}
