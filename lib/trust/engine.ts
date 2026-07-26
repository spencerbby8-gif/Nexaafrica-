import type { Job } from "@/lib/types"
import type { TrustResult, TrustSignal, TrustContext, TrustConfidence } from "./types"
import { TRUST_VERSION } from "./types"

import { employerLegitimacySignal } from "./signals/employerLegitimacy"
import { atsSourceQualitySignal } from "./signals/atsSourceQuality"
import { companyHistorySignal } from "./signals/companyHistory"
import { salaryTransparencySignal } from "./signals/salaryTransparency"
import { applicationMethodSignal } from "./signals/applicationMethod"
import { locationConsistencySignal } from "./signals/locationConsistency"
import { remotePolicyClaritySignal } from "./signals/remotePolicyClarity"
import { postingFreshnessSignal } from "./signals/postingFreshness"
import { duplicateDetectionSignal } from "./signals/duplicateDetection"
import { scamIndicatorsSignal } from "./signals/scamIndicators"

const SIGNAL_FNS = [
  employerLegitimacySignal,
  atsSourceQualitySignal,
  companyHistorySignal,
  salaryTransparencySignal,
  applicationMethodSignal,
  locationConsistencySignal,
  remotePolicyClaritySignal,
  postingFreshnessSignal,
  duplicateDetectionSignal,
  scamIndicatorsSignal,
]

function calculateConfidence(signals: TrustSignal[]): TrustConfidence {
  const lowCount = signals.filter(s => s.confidence === "low" || s.confidence === "unknown").length
  const highCount = signals.filter(s => s.confidence === "high").length

  if (lowCount >= 4) return "low"
  if (highCount >= 6) return "high"
  if (lowCount >= 2) return "medium"
  return "high"
}

export function calculateTrustScore(job: Job, ctx?: TrustContext): TrustResult {
  const signals: TrustSignal[] = []

  for (const fn of SIGNAL_FNS) {
    try {
      // @ts-ignore - some fns accept ctx
      const result = (fn as any)(job, ctx)
      if (result) signals.push(result)
    } catch (e) {
      console.warn(`[trust] signal ${fn.name} failed`, e)
    }
  }

  const base = 50
  const sum = signals.reduce((acc, s) => acc + s.scoreImpact, 0)
  let score = Math.round(base + sum)
  score = Math.max(0, Math.min(100, score))

  // Warning logic: any warning tone or score <40 = flagged
  const hasWarning = signals.some(s => s.tone === "warning")
  const isWarning = hasWarning || score < 40
  const isFlagged = score < 30 || signals.some(s => s.id === "scam_indicators" && s.scoreImpact <= -15)

  let flaggedReason: string | undefined
  if (isFlagged) {
    const worst = signals.filter(s => s.tone === "warning").sort((a,b)=>a.scoreImpact - b.scoreImpact)[0]
    flaggedReason = worst ? `${worst.label}: ${worst.explanation}` : `Low trust score ${score}`
  }

  const confidence = calculateConfidence(signals)

  return {
    score,
    confidence,
    version: TRUST_VERSION,
    signals,
    isFlagged,
    flaggedReason,
    isWarning,
  }
}


/**
 * UNIFIED trust score — one truth path.
 *
 * Nexa has two evidence layers:
 *   1. Listing legitimacy (deterministic signals: ATS source, employer, freshness,
 *      scam checks) -> the persisted jobs.trust_score.
 *   2. Opportunity evidence (AI verifiers reading the live page: salary, Africa
 *      eligibility, remote policy, company, experience) -> job_ai_intelligence.overall_confidence.
 *
 * Previously these were shown as TWO competing scores ("Trust 100" beside
 * "Opportunity Intelligence 19%"), which contradicted. unifiedTrustScore blends
 * them into a SINGLE honest score so a listing can never read as fully verified
 * (100) while its opportunity is unverified. Legitimacy is real but is only half
 * the picture; AI evidence depth is the other half.
 *
 *   no AI evidence yet  -> legitimacy * 0.4  (real listing, not yet analysed)
 *   AI evidence present  -> legitimacy * 0.4 + evidence * 0.6
 */
export function unifiedTrustScore(
  job: Job,
  ai?: { overall_confidence?: number | null } | null,
): number {
  const legitimacyRaw = (job as any).trust_score
  const legitimacy =
    typeof legitimacyRaw === "number"
      ? legitimacyRaw
      : (calculateTrustScore(job).score ?? 50)
  const evidence = ai?.overall_confidence
  if (evidence == null) return Math.round(legitimacy * 0.4)
  return Math.round(legitimacy * 0.4 + evidence * 0.6)
}


export function getTrustLabel(score: number): { label: string; tone: "positive" | "caution" | "warning"; color: string } {
  if (score >= 80) return { label: "Highly Trusted", tone: "positive", color: "text-green-400 border-green-500/30 bg-green-500/10" }
  if (score >= 60) return { label: "Trusted", tone: "positive", color: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" }
  if (score >= 40) return { label: "Moderate Trust", tone: "caution", color: "text-yellow-300 border-yellow-500/30 bg-yellow-500/10" }
  return { label: "Low Trust • Review", tone: "warning", color: "text-red-300 border-red-500/30 bg-red-500/10" }
}
