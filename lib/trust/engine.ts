import { renderEligibility } from "@/lib/geo/render-eligibility"
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
import { companyLearningSignal } from "./signals/companyLearning"
import { sourceLearningSignal } from "./signals/sourceLearning"

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
  companyLearningSignal,
  sourceLearningSignal,
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


/** Signal ids that require TrustContext (measured learning data) — kept from
 * the persisted set when present, since render-time callers have no ctx. */
const PERSISTED_LEARNING_IDS = new Set(["company_history", "company_learning", "source_learning"])

/**
 * [TRUTH LAYER v1] correctedTrustSignals — the display/legitimacy plane.
 *
 * Root cause of the production plateaus (audit P1-2): surfaces showed the
 * persisted jobs.trust_score computed once at write time, so every signal
 * fix landed only for NEW jobs and every correction was invisible; and the
 * unified cap quantized whatever was left. This function rebuilds the signal
 * set at READ time:
 *   - stateless signals are recomputed with the CURRENT weights/copy
 *     (logo +3 instead of the rotten +8, salary/remote/application honesty,
 *     fabricated-freshness zeroed instead of +12),
 *   - ctx-dependent LEARNING signals (company_history / company_learning /
 *     source_learning) are kept from the persisted set — they encode real
 *     measured history that no per-render caller can rebuild,
 *   - legitimacy is then exactly 50 + sum(displayed signal impacts),
 *     so the number on the card ALWAYS sums to the signals listed beneath
 *     it. No hidden clamps, no stale weights, no fabricated freshness.
 */
export function correctedTrustSignals(job: Job, ctx?: TrustContext): { signals: TrustSignal[]; score: number; rawSum: number } {
  let fresh: TrustSignal[] = []
  try {
    fresh = calculateTrustScore(job, ctx).signals
  } catch {
    fresh = []
  }
  const persisted: TrustSignal[] = Array.isArray((job as any).trust_signals) ? (job as any).trust_signals : []
  const keptLearning = persisted.filter((s) => s && PERSISTED_LEARNING_IDS.has((s as any).id))

  let signals: TrustSignal[]
  if (fresh.length === 0 && keptLearning.length === 0) {
    signals = persisted // total fallback: old persisted set (better than nothing)
  } else {
    const freshIds = new Set(fresh.map((s) => s.id))
    signals = [...fresh, ...keptLearning.filter((s) => !freshIds.has((s as any).id))] as TrustSignal[]
  }
  // rawSum is kept visible so the UI can mark the ceiling HONESTLY when the
  // signal sum overruns the 0-100 scale, instead of quietly clamping away
  // exactly the differences the trust plane exists to show.
  const rawSum = Math.round(50 + signals.reduce((acc, s) => acc + (Number((s as any).scoreImpact) || 0), 0))
  const score = Math.max(0, Math.min(100, rawSum))
  return { signals, score, rawSum }
}

/** Listing legitimacy at read time: corrected signal set summed live. */
export function displayLegitimacy(job: Job, ctx?: TrustContext): number {
  return correctedTrustSignals(job, ctx).score
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
/**
 * [TRUTH LAYER v1] Soft cap. The old hard clamps (min(score, 59)) quantized
 * every above-cap score to the SAME value — production sample: ~30/30 cards
 * rendered identical 59; evidence 19% and evidence 95% were indistinguishable
 * (audit P1-2). A compressed cap keeps the protective ceiling (unverified or
 * restricted Africa, or a blocked page, must never read as Trusted/Highly
 * Trusted for an African audience) while preserving evidence-driven ordering
 * beneath it: score' = cap - (100 - score) * CAP_SLOPE for score > cap.
 * Monotone, bounded (<= cap), and honest: stronger evidence always shows a
 * higher number; the BEST an unverified job can show is just under Trusted.
 */
const TRUST_CAP = 59
const CAP_SLOPE = 0.35
export function softCapTrust(score: number, cap: number = TRUST_CAP): number {
  if (score <= cap) return score
  return Math.max(0, Math.min(cap, Math.round(cap - (100 - score) * CAP_SLOPE)))
}

export function unifiedTrustScore(
  job: Job,
  ai?: { overall_confidence?: number | null; africa_eligibility?: string | null; last_verified_at?: string | null; evidence_refs?: any; evidence_provenance?: string | null; page_status?: number | null } | null,
): number {
  // [TRUTH LAYER v1] legitimacy is the CORRECTED read-time plane (recomputed
  // stateless signals + persisted learning entries), never the raw persisted
  // score — ruling out stale weights, the rotten logo +8, and fabricated +12
  // freshness bonuses flowing into the unified number.
  const legitimacy = displayLegitimacy(job)
  const evidence = ai?.overall_confidence
  let score =
    evidence == null
      ? Math.round(legitimacy * 0.4)
      : Math.round(legitimacy * 0.4 + evidence * 0.6)

  // [V1] Dynamic evidence adjustments — every delta derives from stored
  // fields, never static. The same job's score moves as its evidence ages,
  // grows, or gets blocked.
  //  a) Evidence freshness: verification older than 7d loses a little,
  //     older than 30d loses more (stale evidence = weaker trust).
  const verifiedMs = ai?.last_verified_at ? Date.now() - new Date(ai.last_verified_at).getTime() : Infinity
  const verifiedDays = verifiedMs / 86_400_000
  if (verifiedDays > 30) score -= 8
  else if (verifiedDays > 7) score -= 4

  //  b) Evidence richness: more dimensions with stored evidence => +2
  //     (capped), from evidence_refs.dimensionCount when present.
  const dimCount = Number(ai?.evidence_refs?.dimensionCount) || 0
  if (dimCount >= 5) score += 2
  else if (dimCount >= 3) score += 1

  //  c) Evidence quality: page-level verification provenance adds a small
  //     confidence bonus; dead pages (404/410) reduce trust.
  const prov = ai?.evidence_provenance ?? null
  if (prov === "company_page" || prov === "page") score += 2
  const pageStatus = Number(ai?.page_status) || 0
  if (pageStatus === 404 || pageStatus === 410) score -= 10

  //  d) Job-level crawler state: a blocked page caps trust (evidence
  //     couldn't be read — never pretend otherwise).
  const evState = (job as any).evidence_state ?? null
  if (evState === "blocked") score = softCapTrust(score)

  score = Math.max(0, Math.min(100, score))

  // [STABILIZATION] Trust and Nexa Intelligence must agree: when the AI
  // verdict says Africa eligibility is unknown or restricted, the job can
  // never display as Trusted/Highly Trusted for an African audience —
  // cap at Moderate Trust (59) until the AI verifies it.
  // [EVIDENCE V1.2] The cap consults the arbitration plane, not the bare
  // stored verdict: a stored "explicit" the corpus cannot find in the
  // posting held today (mali FP class) is an evidence mistake — it is
  // surfaced honestly and caps like unverified instead of sailing through
  // on a fabricated claim. Tier semantics identical otherwise.
  let africaTier: string | null | undefined = ai?.africa_eligibility
  try {
    africaTier = renderEligibility(job as any, ai?.africa_eligibility ?? null).tier
  } catch {}
  if (africaTier === 'unknown' || africaTier === 'restricted') return softCapTrust(score)
  return score
}


/** [V3] Why the unified trust score was capped (if it was). */
export function unifiedCapNote(africa: string | null | undefined, evidenceState?: string | null): string | null {
  if (evidenceState === 'blocked') return 'Capped: the job page is blocked — trust cannot exceed Moderate until fresh evidence is collected.'
  if (africa === 'unknown') return 'Capped: Africa eligibility is unverified — trust cannot exceed Moderate until the AI verifies the role.'
  if (africa === 'restricted') return 'Capped: the AI judged this role restricted for African applicants.'
  return null
}

export function getTrustLabel(score: number): { label: string; tone: "positive" | "caution" | "warning"; color: string } {
  if (score >= 80) return { label: "Highly Trusted", tone: "positive", color: "text-green-400 border-green-500/30 bg-green-500/10" }
  if (score >= 60) return { label: "Trusted", tone: "positive", color: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" }
  if (score >= 40) return { label: "Moderate Trust", tone: "caution", color: "text-yellow-300 border-yellow-500/30 bg-yellow-500/10" }
  return { label: "Low Trust • Review", tone: "warning", color: "text-red-300 border-red-500/30 bg-red-500/10" }
}
