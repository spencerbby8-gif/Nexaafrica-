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
  const verificationRate = Number(ci.verification_rate) || 0
  const velocity = Number(ci.hiring_velocity_30d) || 0
  const aiConf = Number(ci.avg_ai_confidence) || 0
  // [V1-HONESTY] AI-truth Africa metrics. africa_rate is now
  // AI-confirmed-open / all postings — tiny for almost every company because
  // the AI has judged only a handful of jobs (92% unknown). A low africa_rate
  // with sparse evidence is "not enough evidence", NOT "rarely open". The
  // caution fires ONLY when the AI has actually judged enough jobs (>=8) and
  // found them mostly not open. Otherwise a neutral note is emitted.
  const decidedJobs = Number(ci.africa_decided_jobs) || 0
  const openOfDecided = Number(ci.africa_open_of_decided)
  const unknownShare = Number(ci.africa_unknown_share) ?? 1

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

  // Caution: enough AI-judged postings to conclude they are mostly not open.
  if (decidedJobs >= 8 && openOfDecided >= 0 && openOfDecided < 0.2) {
    return {
      id: "company_learning",
      label: "Rarely open to Africa",
      scoreImpact: -6,
      confidence: "medium",
      tone: "caution",
      explanation: `${job.company} posts mostly region-locked roles — verify eligibility with the employer.`,
      evidence: `${Math.round(openOfDecided * 100)}% Africa-open of ${decidedJobs} AI-verified roles`,
      source: "learning",
    }
  }

  // Neutral: honest unknown-share note when evidence is still sparse
  // (never punishes the company for the pipeline's lack of evidence).
  if (total >= 4 && decidedJobs < 8 && unknownShare >= 0.5) {
    return {
      id: "company_learning",
      label: "Limited verification",
      scoreImpact: 0,
      confidence: "medium",
      tone: "neutral",
      explanation: `Nexa has AI-verified only ${decidedJobs} of ${total} of ${job.company}'s active roles (${Math.round(unknownShare * 100)}% unverified). Eligibility should be confirmed with the employer.`,
      evidence: `${decidedJobs}/${total} roles AI-verified`,
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
