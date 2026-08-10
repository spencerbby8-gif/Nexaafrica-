// [RELIABILITY] Fallback version label when the verifier bundle is empty.
// Was "gemini-2.5-flash-v1" — a DEAD model ID (pulled early 2026-07) stamped
// on new rows, which also failed the engine's allProvidersFailed retry check
// (jobs got sealed completed with a fake model label). "no-ai-providers" is
// honest AND makes empty bundles retryable via the existing backoff path.
export const AI_MODEL_VERSION = "no-ai-providers"
export const AI_INTELLIGENCE_VERSION = 1

export type Confidence = number // 0-100

export interface Evidence {
  text: string // verbatim quote from job page or company page
  url: string // source URL where evidence found
  type: "job_description" | "company_page" | "apply_page" | "ats_metadata"
}

export interface AIResult<T> {
  value: T
  confidence: Confidence
  evidence: Evidence[]
  sourceUrls: string[]
  lastVerified: string // ISO
  modelVersion: string
}

export type AfricaEligibility = "explicit" | "likely" | "restricted" | "unknown"
export type RemoteEligibility = "fully_remote" | "hybrid" | "onsite" | "unknown"
export type VisaSponsorship = "available" | "not_available" | "unknown" | "conditional"

export interface JobAIIntelligence {
  jobId: string
  version: number
  modelVersion: string

  africa: AIResult<AfricaEligibility> & {
    countryRestrictions: string[]
  }
  remote: AIResult<RemoteEligibility> & {
    timezoneRequirements?: string
  }
  visa: AIResult<VisaSponsorship>
  salary: AIResult<{
    min: number | null
    max: number | null
    currency: string | null
    period: string | null
    isEstimated: boolean
    transparency: "disclosed" | "estimated" | "undisclosed" | "unknown"
  }>
  company: AIResult<"verified" | "likely_legit" | "unknown" | "suspicious">
  quality: AIResult<"high" | "medium" | "low" | "unknown"> & {
    reasons: string[]
  }
  experience: AIResult<"entry" | "mid" | "senior" | "executive" | "unknown">
  skills: {
    required: AIResult<string[]>
    transferable: AIResult<string[]>
    missing: AIResult<string[]>
  }
  applicationDifficulty: AIResult<"easy" | "medium" | "hard" | "unknown">
  hiringUrgency: AIResult<"high" | "medium" | "low" | "unknown">

  overallConfidence: Confidence
  lastVerifiedAt: string
}

export interface ProcessingJob {
  id: string
  jobId: string
  status: "pending" | "processing" | "completed" | "failed" | "skipped"
  attempts: number
  maxAttempts: number
  error?: string
  priority: number
}
