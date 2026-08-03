import type { Job } from "@/lib/types"

export const TRUST_VERSION = 2

export type TrustConfidence = "high" | "medium" | "low" | "unknown"
export type TrustTone = "positive" | "caution" | "warning" | "neutral"

export type TrustSignalId =
  | "employer_legitimacy"
  | "ats_source_quality"
  | "company_history"
  | "salary_transparency"
  | "application_method"
  | "location_consistency"
  | "remote_policy_clarity"
  | "posting_freshness"
  | "duplicate_detection"
  | "scam_indicators"
  | "company_learning"
  | "source_learning"

export interface TrustSignal {
  id: TrustSignalId
  label: string
  scoreImpact: number // -20 to +20
  confidence: TrustConfidence
  tone: TrustTone
  explanation: string // why this score
  evidence?: string // verbatim quote or data point
  source: "company" | "ats" | "history" | "salary" | "application" | "location" | "remote" | "freshness" | "duplicate" | "scam-check" | "metadata" | "learning"
}

export interface TrustResult {
  score: number // 0-100
  confidence: TrustConfidence
  version: number
  signals: TrustSignal[]
  isFlagged: boolean
  flaggedReason?: string
  isWarning: boolean
}

export interface TrustContext {
  companyJobCount?: number
  isDuplicate?: boolean
  duplicateOf?: string | null
  /** [V2] company_intelligence row for this job's company (real learning data). */
  companyIntel?: Record<string, any> | null
  /** [V2] source_intelligence row for this job's source (real learning data). */
  sourceIntel?: Record<string, any> | null
}

export type TrustSignalFn = (job: Job, ctx?: TrustContext) => TrustSignal | null
