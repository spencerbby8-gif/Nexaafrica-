import type { Job } from "@/lib/types"

export interface SalaryVerification {
  min: number | null
  max: number | null
  currency: string | null
  period: string | null
  isEstimated: boolean
  transparency: "disclosed" | "estimated" | "undisclosed" | "unknown"
  confidence: number
  evidence: string
  sourceUrls: string[]
}

/**
 * Verifier: Salary truthfulness, never guesses, returns unknown when evidence missing
 */
export function verifySalary(job: Job): SalaryVerification {
  const hasStructured = job.salary_min != null || job.salary_max != null
  const hasRange = !!job.salary_range

  if (hasStructured && hasRange) {
    return {
      min: job.salary_min,
      max: job.salary_max,
      currency: job.salary_currency,
      period: job.salary_period,
      isEstimated: false,
      transparency: "disclosed",
      confidence: 90,
      evidence: job.salary_range || "",
      sourceUrls: [job.apply_url],
    }
  }

  if (hasRange) {
    return {
      min: job.salary_min,
      max: job.salary_max,
      currency: job.salary_currency,
      period: job.salary_period,
      isEstimated: false,
      transparency: "disclosed",
      confidence: 75,
      evidence: job.salary_range || "",
      sourceUrls: [job.apply_url],
    }
  }

  // No salary disclosed — do NOT fabricate estimate unless clearly labeled and backed by evidence
  // For foundation, return unknown, not estimated
  return {
    min: null,
    max: null,
    currency: null,
    period: null,
    isEstimated: false,
    transparency: "undisclosed",
    confidence: 20,
    evidence: "No compensation listed in official feed",
    sourceUrls: [job.apply_url],
  }
}
