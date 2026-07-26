import type { Job } from "@/lib/types"

/**
 * Company legitimacy — HONEST default.
 * A company logo / ATS apply link does NOT prove legitimacy, so we never assert
 * "verified"/"likely_legit" with a fabricated confidence from those alone. The
 * live verifier (realCompanyLegitimacyAI.ts) may still reach a real verdict when
 * it can read the company page; this rule-based fallback stays UNKNOWN.
 */
export function verifyCompanyLegitimacy(_job: Job) {
  return { value: "unknown" as const, confidence: 0, evidence: "", sourceUrls: _job.apply_url ? [_job.apply_url] : [] }
}
