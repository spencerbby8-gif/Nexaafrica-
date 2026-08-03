import type { TrustSignal, TrustContext } from "../types"
import type { Job } from "@/lib/types"

/**
 * [V2] Source learning signal — real measured source reliability from the
 * learning layer (source_intelligence): reliability of ingest runs, verified
 * share, composite trust. Uses ctx.sourceIntel (populated by the ingest layer).
 */
export function sourceLearningSignal(job: Job, ctx?: TrustContext): TrustSignal | null {
  const si = ctx?.sourceIntel
  if (!si || !job.source) return null

  const total = Number(si.total_jobs) || 0
  if (total === 0) return null

  const trust = Number(si.trust_score) || 0
  const reliability = Number(si.reliability_score) ?? 0
  const verificationRate = Number(si.verification_rate) || 0
  const dupShare = total > 0 ? (Number(si.duplicate_count) || 0) / total : 0

  let impact = 0
  const bits: string[] = []

  if (trust >= 60) { impact += 4; bits.push(`source trust ${Math.round(trust)}`) }
  if (trust <= 25) { impact -= 5; bits.push(`source trust ${Math.round(trust)}`) }
  if (reliability >= 0.9) { impact += 2; bits.push(`reliable feed`) }
  if (reliability > 0 && reliability < 0.5) { impact -= 3; bits.push(`flaky feed`) }
  if (verificationRate >= 0.6) { impact += 2; bits.push(`${Math.round(verificationRate * 100)}% verified`) }
  if (dupShare >= 0.3) { impact -= 3; bits.push(`${Math.round(dupShare * 100)}% duplicates`) }

  if (impact === 0) return null

  return {
    id: "source_learning",
    label: "Source track record",
    scoreImpact: impact,
    confidence: "medium",
    tone: impact < 0 ? "caution" : "positive",
    explanation: `${job.source || "source"} feed: ${bits.join(", ")}.`,
    evidence: bits.join(" · "),
    source: "learning",
  }
}
