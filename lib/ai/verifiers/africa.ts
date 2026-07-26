import type { Job } from "@/lib/types"

/**
 * Africa eligibility — HONEST default.
 * Weak signals (remote flag, no restriction seen) are not enough to assert a
 * confident tier with evidence. The deterministic classifier (jobs.eligibility)
 * and the live AI verifier (realAfricaEligibilityAI.ts) carry the real verdict;
 * this rule-based fallback returns UNKNOWN with empty evidence.
 */
export function verifyAfricaEligibility(_job: Job) {
  return { value: "unknown" as const, confidence: 0, evidence: "", sourceUrls: _job.apply_url ? [_job.apply_url] : [] }
}
