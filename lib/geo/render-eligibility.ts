import {
  classifyGeoEligibility,
  type AfricaTier,
} from "./eligibility"

/**
 * [EVIDENCE V1.2] Eligibility arbitration plane — ONE evidence plane for every
 * Africa claim on every surface (card chip, evidence panel, opportunity
 * intelligence, company hubs, country hubs, intent pages, share text).
 *
 * Why this exists (live-proven 2026-08-05):
 *   - Stored verdicts go stale the moment the corpus improves: the audit-leader
 *     row rendered "Explicitly open to Africa • 75%" from a `mali` substring FP
 *     long after the corpus stopped emitting it; Oben's Romania-locked role sat
 *     on /remote-jobs/nigeria asserting "Likely open" from a pre-corpus ingest.
 *   - Three stored tiers (ingest eligibility, AI verdict, feed boolean) drifted
 *     apart, and each surface picked a different one — contradictions between
 *     card, detail, hub, and intent pages over the SAME posting text.
 *
 * Arbitration rule: the shared corpus (`classifyGeoEligibility`) re-reads the
 * posting text at render time. Its verdict is authoritative and fresh; a stored
 * claim is displayed only when the corpus corroborates it. A stored claim the
 * corpus can no longer find in the posting is surfaced honestly as unverified
 * — never flattened into the claim and never silently trusted.
 */

export interface RenderEligibility {
  /** Authoritative tier the UI must render. */
  tier: AfricaTier
  /** True when a stored claim exists AND the current corpus agrees with it. */
  corroborated: boolean
  /** Tier computed from the posting text right now. */
  corpusTier: AfricaTier
  /** The stored claim consulted (AI verdict first, then ingest tier). */
  storedTier: string | null
  /** Word-aligned quote from the corpus when it found decisive text. */
  quote: string | null
  reason: string
}

type JobLike = {
  description_md?: string | null
  location?: string | null
  eligibility?: string | null
  is_open_to_africa?: boolean | null
}

export function renderEligibility(job: JobLike, storedAITier?: string | null): RenderEligibility {
  const corpus = classifyGeoEligibility({
    text: job.description_md ?? "",
    locationField: job.location ?? null,
  })
  const storedTier = storedAITier ?? job.eligibility ?? null

  // Corpus-confirmed tiers are always renderable as-is — the evidence is in
  // the posting text we hold today, regardless of what any stored row says.
  if (corpus.tier === "explicit") {
    return { tier: "explicit", corroborated: storedTier === "explicit", corpusTier: "explicit", storedTier, quote: corpus.quote, reason: corpus.reason }
  }
  if (corpus.tier === "restricted") {
    return { tier: "restricted", corroborated: storedTier === "restricted", corpusTier: "restricted", storedTier, quote: corpus.quote, reason: corpus.reason }
  }
  if (corpus.tier === "likely") {
    // Feed flag says not-open and the corpus found no Africa anchor — the
    // system's own region lock still suppresses an affirmative claim.
    const tier: AfricaTier = job.is_open_to_africa === false ? "unknown" : "likely"
    return { tier, corroborated: tier === "likely" && (storedTier === "likely" || storedTier === "explicit"), corpusTier: "likely", storedTier, quote: corpus.quote, reason: corpus.reason }
  }

  // Corpus is silent (unknown). A stored claim it cannot see must never render
  // as a verified claim: that is exactly how the mali FP and marketing-derived
  // "likely" verdicts kept asserting Africa openness with no traceable evidence.
  if (storedTier === "likely") {
    return { tier: "likely", corroborated: false, corpusTier: "unknown", storedTier, quote: null, reason: "stored-claim-not-in-current-text" }
  }
  // Stored explicit with no Africa word in the current text: contradicted by
  // the posting we hold — render unknown, not a fabricated explicit.
  return { tier: "unknown", corroborated: storedTier === "unknown" || storedTier == null, corpusTier: "unknown", storedTier, quote: null, reason: storedTier === "explicit" ? "stored-explicit-contradicted-by-current-text" : "no-signal" }
}

/** Surfaces that promise Africa eligibility may only list corpus-confirmed
 *  explicit/likely rows. Stored-only claims do not qualify — on a page titled
 *  "open to applicants in Africa" an untraceable claim is a false inclusion. */
export function eligibleForAfricaSurfaces(job: JobLike, storedAITier?: string | null): boolean {
  const { corpusTier } = renderEligibility(job, storedAITier)
  return corpusTier === "explicit" || corpusTier === "likely"
}

/** Country hubs must never list a role the current posting text locks to
 *  another region (live case: "Remote (Anywhere Romania)" on /remote-jobs/
 *  nigeria). Unknown rows stay with their honest unknown label. */
export function excludeFromCountryHub(job: JobLike, storedAITier?: string | null): boolean {
  return renderEligibility(job, storedAITier).tier === "restricted"
}
