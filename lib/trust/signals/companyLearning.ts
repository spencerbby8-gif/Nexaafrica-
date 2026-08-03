import type { TrustSignal, TrustContext } from "../types"
import type { Job } from "@/lib/types"

/**
 * [V2] Company learning signal — real measured data from the learning layer:
 *   - high rejection share or low Africa-eligibility → caution
 *   - healthy verification rate + hiring velocity + AI confidence → positive
 * Uses the optional ctx.companyIntel row (populated by the ingest layer).
 */
export function companyLearningSignal(job: Job, ctx?: TrustContext): TrustSignal | null {
  const ci = ctx?.companyIntel
  if (!ci) return null

  const total = Number(ci.total_jobs) || 0
  if (total === 0) return null

  const rejectionRate = Number(ci.rejection_rate) || 0
  const africaRate = Number(ci.africa_rate) ?? 1
  const verificationRate = Number(ci.verification_rate) || 0
  const velocity = Number(ci.hiring_velocity_30d) || 0
  const aiConf = Number(ci.avg_ai_confidence) || 0

  // Hard caution: most of this company's jobs get rejected by the pipeline.
  if (rejectionRate >= 0.5) {
    return {
      id: "company_learning",
      label: "High rejection history",
      scoreImpact: -10,
      confidence: "high",
      tone: "warning",
      explanation: `${job.company} has ${Math.round(rejectionRate * 100)}% of recent jobs rejected by Nexa's screening — repeated false or ineligible postings.`,
      evidence: `${Math.round(rejectionRate * 100)}% rejection rate`,
      source: "learning",
    }
  }

  // Caution: mostly not open to Africa.
  if (total >= 4 && africaRate < 0.2) {
    return {
      id: "company_learning",
      label: "Rarely open to Africa",
      scoreImpact: -6,
      confidence: "medium",
      tone: "caution",
      explanation: `${job.company} posts mostly region-locked roles — verify eligibility with the employer.`,
      evidence: `${Math.round(africaRate * 100)}% Africa-eligible share`,
      source: "learning",
    }
  }

  // Positive: verified hires, recent velocity, decent AI confidence.
  let impact = 0
  const bits: string[] = []
  if (verificationRate >= 0.6) { impact += 5; bits.push(`verification rate ${Math.round(verificationRate * 100)}%`) }
  if (velocity >= 3) { impact += 3; bits.push(`${velocity} roles posted in 30d`) }
  if (aiConf >= 40) { impact += 2; bits.push(`AI confidence ${aiConf}`) }
  if (impact === 0) return null

  return {
    id: "company_learning",
    label: "Measured hiring health",
    scoreImpact: impact,
    confidence: "high",
    tone: "positive",
    explanation: `${job.company}: ${bits.join(", ")}.`,
    evidence: bits.join(" · "),
    source: "learning",
  }
}
