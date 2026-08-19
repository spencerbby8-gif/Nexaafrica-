/**
 * [PHASE-2] The ONE canonical definition of "verified" intelligence.
 *
 * Before Phase 2 the codebase had at least five divergent definitions
 * (homepage pool, /jobs ranking, /api/jobs, matching, counters) while the
 * learning layer (company/source intelligence) already counted a job as
 * verified only when quality_score >= 40. That disagreement let low-quality
 * provider rows headline the homepage while learning called them unverified.
 *
 * Canonical contract (evidence-based, never weakens with inventory):
 *   verified  =  model_version is a real provider:model pair
 *                (contains ':', never 'regex…'/'no-ai…' fallback markers)
 *             AND quality_score >= VERIFIED_MIN_QUALITY
 *
 * quality_score is the persisted output of evaluateIntelligence()
 * (truthScore/evidenceCoverage/hallucinationRisk blend) — requiring it means
 * a "verified" job carries real dimensional evidence, not just a model name.
 */

export const VERIFIED_MIN_QUALITY = 40

export interface VerifiedCandidate {
  model_version: string | null | undefined
  quality_score?: number | null | undefined
}

/** Canonical "real, quality-checked AI verification" predicate. */
export function isVerifiedIntelligence(ai: VerifiedCandidate | null | undefined): boolean {
  const mv = ai?.model_version || ''
  if (!mv.includes(':')) return false // no provider:model provenance
  if (mv.startsWith('regex')) return false // deterministic fallback era
  if (mv.startsWith('no-ai')) return false // provider-less fallback
  return (ai?.quality_score ?? 0) >= VERIFIED_MIN_QUALITY
}

/** Africa tiers that count as genuinely open (never promote 'unknown'). */
export const AFRICA_OPEN_TIERS = ['explicit', 'likely'] as const

export interface VerifiedEligibleCandidate extends VerifiedCandidate {
  africa_eligibility?: string | null | undefined
}

/**
 * Canonical homepage/matching pool predicate: verified AND the AI itself
 * confirmed Africa compatibility. 'unknown'/'restricted' never qualify —
 * unknown stays unknown.
 */
export function isVerifiedAfricaOpen(ai: VerifiedEligibleCandidate | null | undefined): boolean {
  if (!isVerifiedIntelligence(ai)) return false
  return (AFRICA_OPEN_TIERS as readonly string[]).includes(ai?.africa_eligibility || '')
}

/**
 * Deterministic verified-first partition. Preserves the incoming (DB) order
 * inside each tier so pagination built on top stays duplicate-free and total.
 */
export function partitionVerifiedFirst<T extends { aiIntelligence?: VerifiedCandidate | null }>(
  jobs: T[],
): T[] {
  const verified: T[] = []
  const rest: T[] = []
  for (const j of jobs) {
    if (isVerifiedIntelligence(j.aiIntelligence)) verified.push(j)
    else rest.push(j)
  }
  return [...verified, ...rest]
}
