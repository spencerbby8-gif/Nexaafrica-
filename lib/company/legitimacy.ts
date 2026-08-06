import { INGEST_SOURCES } from "@/lib/ingest/companies"

/**
 * [COMPANY PLANE — CANONICAL OWNER] One owner for company legitimacy.
 *
 * Audit (TRUTH_LAYER_V1_BUILD §16): three competing writers produced
 * contradictory verdicts for the SAME company — the trust plane's curated-
 * registry signal ("Verified employer +15" on every curated row), the per-job
 * AI verifier whose verdict flipped with per-run company-page fetch luck
 * (Reddit: unknown on one job, verified on another), and the learning table.
 *
 * This module is the single write-plane authority. Rules:
 *  1. A company's identity verdict NEVER depends on per-job fetch liveness.
 *  2. Registry membership is a source-authenticated fact: jobs from these
 *     companies arrive ONLY through the company's official ATS feed, which
 *     Nexa curated and verified (lib/ingest/companies.ts). That is a
 *     company-plane fact, valid for every job from that feed.
 *  3. Posting-level scam evidence may DEMOTE a non-registry verdict — it
 *     can never promote one. Per-job AI never asserts identity.
 *  4. Measured learning (company_intelligence aggregates) may support a
 *     bounded "likely_legit" — measurement, not extraction luck.
 *  5. When none of the above holds, the honest verdict is "unknown".
 *
 * Render never calls this module (suite 13g guards the boundary); surfaces
 * display the persisted verdict this owner wrote.
 */

export type LegitimacyValue = "verified" | "likely_legit" | "suspicious" | "unknown"
export type LegitimacyBasis =
  | "curated_registry"
  | "measured_learning"
  | "posting_scam_evidence"
  | "insufficient_evidence"

export interface CanonicalLegitimacy {
  value: LegitimacyValue
  confidence: number
  basis: LegitimacyBasis
  /** Stated basis for the verdict. A provenance sentence, never a fabricated posting quote. */
  evidence: string | null
}

export interface CompanyLearningInput {
  totalRoles: number
  verificationRate: number | null
  roles30d?: number
}

const CURATED_COMPANIES = new Set(INGEST_SOURCES.map((s) => s.company.toLowerCase()))

const PLACEHOLDER_NAMES = new Set(["name", "company", "company name", "unknown", "n/a", "none", "test", "example"])

export function isCuratedEmployer(company: string | null | undefined): boolean {
  if (!company) return false
  return CURATED_COMPANIES.has(company.toLowerCase().trim())
}

export function companyLegitimacyOwner(input: {
  company: string
  /** Posting-level scam evidence (e.g. per-job AI "suspicious" + quote). Optional. */
  suspiciousEvidence?: string | null
  /** Measured learning-plane aggregates for the company. Optional. */
  learning?: CompanyLearningInput | null
}): CanonicalLegitimacy {
  const name = (input.company || "").trim()

  // 1. Canonical verified: the posting reached us through the company's own
  //    official, curated ATS feed. Channel-authenticated — fetch luck cannot
  //    change it. Scam-pattern noise on a single posting cannot demote it
  //    (posting-level scam signals are surfaced separately as trust signals).
  if (isCuratedEmployer(name)) {
    return {
      value: "verified",
      confidence: 95,
      basis: "curated_registry",
      evidence: `${name} is on Nexa's curated employer registry — jobs arrive via the company's official ATS feed, a channel Nexa verified directly.`,
    }
  }

  // 2. Posting-level scam evidence demotes (never promotes) non-registry verdicts.
  const scam = (input.suspiciousEvidence || "").trim()
  if (scam) {
    return {
      value: "suspicious",
      confidence: 60,
      basis: "posting_scam_evidence",
      evidence: scam.slice(0, 200),
    }
  }

  // 3. Measured learning: real, aggregated hiring history through the pipeline —
  //    thresholds are deterministic company-plane policy, not per-run extraction.
  const learn = input.learning
  if (learn && !PLACEHOLDER_NAMES.has(name.toLowerCase()) && learn.totalRoles >= 3 && (learn.verificationRate ?? 0) >= 0.15) {
    const rate = Math.round((learn.verificationRate ?? 0) * 100)
    return {
      value: "likely_legit",
      confidence: Math.min(70, 45 + Math.round(25 * (learn.verificationRate ?? 0))),
      basis: "measured_learning",
      evidence: `${name}: ${learn.totalRoles} roles processed on Nexa, verification rate ${rate}%. Measured hiring presence — not yet source-authenticated.`,
    }
  }

  // 4. Honest absence: nothing measured, nothing authenticated.
  return { value: "unknown", confidence: 0, basis: "insufficient_evidence", evidence: null }
}
