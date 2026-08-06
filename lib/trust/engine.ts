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


/** Signal ids that require measured learning context (TrustContext) — kept
 * from the persisted set during a rescore, since per-row rescoring without
 * ctx cannot rebuild measured history. */
const PERSISTED_LEARNING_IDS = new Set(["company_history", "company_learning", "source_learning"])

/**
 * [ARCHITECTURE 2026-08-05 — single-owner doctrine] WRITE-PLANE rescore.
 *
 * Recomputes a row's trust with the CURRENT signal weights/copy while
 * preserving the persisted measured-learning entries (company_history /
 * company_learning / source_learning encode real measured history that a
 * per-row rescore cannot rebuild without its context). Downstream fields
 * (confidence, warning, flag) are derived from the merged set exactly as
 * calculateTrustScore derives them.
 *
 * Consumers: the write path ONLY — POST /api/jobs/backfill-trust and any
 * re-verification pass — which PERSISTS the result. The render layer must
 * NEVER call this: it displays the persisted trust_signals / trust_score.
 * Stale truth is healed here; it is never masked at render. (This is the
 * computation that used to run at read time — reverted under the doctrine.
 * Render now shows the stored plane, and old rows are re-healed by rescore.)
 */
export function rescoreTrustSignals(job: Job, ctx?: TrustContext): TrustResult & { rawSum: number } {
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
  const rawSum = Math.round(50 + signals.reduce((acc, s) => acc + (Number((s as any).scoreImpact) || 0), 0))
  const score = Math.max(0, Math.min(100, rawSum))

  const hasWarning = signals.some((s) => s.tone === "warning")
  const isWarning = hasWarning || score < 40
  const isFlagged = score < 30 || signals.some((s) => s.id === "scam_indicators" && s.scoreImpact <= -15)
  let flaggedReason: string | undefined
  if (isFlagged) {
    const worst = signals.filter((s) => s.tone === "warning").sort((a, b) => a.scoreImpact - b.scoreImpact)[0]
    flaggedReason = worst ? `${worst.label}: ${worst.explanation}` : `Low trust score ${score}`
  }
  const confidence = calculateConfidence(signals)

  return { score, confidence, version: TRUST_VERSION, signals, isFlagged, flaggedReason, isWarning, rawSum }
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
  ai?: { overall_confidence?: number | null; africa_eligibility?: string | null } | null,
): number {
  // [ARCHITECTURE 2026-08-05 — single-owner doctrine] This is a PRESENTATION
  // METRIC over canonical persisted inputs ONLY: the persisted listing-
  // legitimacy score (written by the Trust Engine at ingest / rescore) and
  // the persisted Nexa Intelligence overall_confidence. It performs no new
  // intelligence at render — no freshness decay, no richness or provenance
  // bonuses, no page-status re-judgement, no corpus re-arbitration. Evidence
  // age/depth are weighed by the verifier plane into overall_confidence at
  // write time, and stale signal weights are healed by the rescore backfill
  // (POST /api/jobs/backfill-trust).
  const legitimacyRaw = (job as any).trust_score
  const legitimacy =
    typeof legitimacyRaw === "number"
      ? legitimacyRaw
      // Compute-on-miss: a row never scored by the write path is scored by
      // the Trust Engine itself (the canonical owner) — never by render-
      // invented logic. New ingests persist a score; this fallback exists
      // only for legacy rows lacking one.
      : (calculateTrustScore(job).score ?? 50)
  const evidence = ai?.overall_confidence
  let score =
    evidence == null
      ? Math.round(legitimacy * 0.4)
      : Math.round(legitimacy * 0.4 + evidence * 0.6)

  // Job-level crawler state (stored, canonical plane): a blocked page caps
  // trust — evidence couldn't be read, never pretend otherwise. [C3] The
  // cap decision is the pre-existing rule; the soft cap is its monotone,
  // order-preserving presentation and alters no business decision.
  const evState = (job as any).evidence_state ?? null
  if (evState === "blocked") score = softCapTrust(score)

  score = Math.max(0, Math.min(100, score))

  // [STABILIZATION] Trust and Nexa Intelligence must agree: when the AI
  // verdict says Africa eligibility is unknown or restricted, the job can
  // never display as Trusted/Highly Trusted for an African audience —
  // cap at Moderate Trust (59) until the AI verifies it.
  // [ARCHITECTURE — single-owner doctrine] The cap gates on the CANONICAL
  // stored verdict. The render layer never re-arbitrates it; a stale
  // verdict is healed by re-verification/backfill, never masked here.
  const africa = ai?.africa_eligibility
  if (africa === 'unknown' || africa === 'restricted') return softCapTrust(score)
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
