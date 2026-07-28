/**
 * Job Intelligence System - Types and Interfaces
 * Created: 2026-07-27
 * Version: 1.0
 */

// ============================================================================
// Evidence Types
// ============================================================================

export type EvidenceType =
  | 'company_website'
  | 'ats_data'
  | 'career_page'
  | 'domain_quality'
  | 'broken_links'
  | 'duplicate_detection'
  | 'salary_realism'
  | 'company_reputation'
  | 'hiring_regions'
  | 'visa_support'
  | 'eor_payroll'
  | 'prior_intelligence'

export type VerificationStatus = 'verified' | 'failed' | 'partial' | 'pending'

export interface Evidence {
  id?: string
  job_id: string
  evidence_type: EvidenceType
  source_url?: string
  source_name?: string
  evidence_data: Record<string, any>
  evidence_summary?: string
  verification_status: VerificationStatus
  verification_details?: Record<string, any>
  verified_at?: string
  confidence_score: number
  confidence_reasons?: string[]
  collected_at?: string
  expires_at?: string
  is_stale?: boolean
}

// ============================================================================
// Score Types
// ============================================================================

export type TrustLevel = 'high' | 'medium' | 'low' | 'very_low'
export type AfricaEligibility = 'Explicit' | 'Likely' | 'Unknown' | 'Restricted'

export interface TrustScore {
  trust_score: number
  trust_breakdown: Record<string, number>
  trust_reasons: string[]
  trust_level: TrustLevel
}

export interface AfricaEligibilityScore {
  africa_eligibility: AfricaEligibility
  africa_confidence: number
  africa_breakdown: Record<string, number>
  africa_reasons: string[]
  africa_evidence: string[]
}

export interface IntelligenceScore {
  intelligence_score: number
  intelligence_breakdown: Record<string, number>
  intelligence_reasons: string[]
  ai_confidence?: number
  ai_providers_used?: string[]
  ai_agreement_score?: number
}

export interface JobScores {
  job_id: string
  trust_score: TrustScore
  africa_eligibility: AfricaEligibilityScore
  intelligence_score: IntelligenceScore
  calculated_at: string
  expires_at?: string
  is_stale?: boolean
}

// ============================================================================
// Moderation Types
// ============================================================================

export type ModerationStatus = 'pending' | 'approved' | 'quarantined' | 'archived' | 'deleted'

export interface QualityGate {
  name: string
  passed: boolean
  value?: any
  threshold?: any
  reason?: string
}

export interface ModerationFlags {
  scam: boolean
  spam: boolean
  duplicate: boolean
  expired: boolean
  broken_link: boolean
  placeholder_company: boolean
  impossible_salary: boolean
  low_quality: boolean
}

export interface ModerationResult {
  job_id: string
  status: ModerationStatus
  status_reason: string
  quality_gates: QualityGate[]
  gates_passed: number
  gates_total: number
  gates_failed: QualityGate[]
  flags: ModerationFlags
  flag_count: number
  actions?: string[]
  last_verified_at?: string
  next_verification_at?: string
}

// ============================================================================
// Investigation Types
// ============================================================================

export type InvestigationType = 'initial' | 're_verification' | 'manual_review' | 'user_report'

export interface Finding {
  id: string
  type: string
  description: string
  evidence_refs: string[]
  confidence: number
  timestamp: string
}

export interface Conclusion {
  id: string
  conclusion: string
  reasoning: string
  evidence_refs: string[]
  confidence: number
  timestamp: string
}

export interface Recommendation {
  id: string
  action: string
  priority: 'high' | 'medium' | 'low'
  reasoning: string
  timestamp: string
}

export interface Investigation {
  id?: string
  job_id: string
  investigation_type: InvestigationType
  triggered_by: string
  findings: Finding[]
  conclusions: Conclusion[]
  recommendations?: Recommendation[]
  trust_score_at_investigation?: number
  africa_eligibility_at_investigation?: AfricaEligibility
  intelligence_score_at_investigation?: number
  actions_taken?: string[]
  investigation_duration_ms?: number
  created_at?: string
}

// ============================================================================
// Job Types (Extended)
// ============================================================================

export interface JobWithIntelligence {
  id: string
  title: string
  company: string
  description: string
  location?: string
  salary_min?: number
  salary_max?: number
  salary_currency?: string
  posted_at: string
  apply_url: string
  company_website?: string
  source: string
  source_id: string
  
  // Intelligence fields
  trust_score?: number
  africa_eligibility?: AfricaEligibility
  africa_confidence?: number
  intelligence_score?: number
  moderation_status?: ModerationStatus
  last_verified_at?: string
  next_verification_at?: string
  
  // Related data
  evidence?: Evidence[]
  scores?: JobScores
  moderation?: ModerationResult
  investigations?: Investigation[]
}

// ============================================================================
// Collector Types
// ============================================================================

export interface EvidenceCollector {
  type: EvidenceType
  collect(job: import('@/lib/types').Job): Promise<Evidence>
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface IntelligenceConfig {
  evidence_collectors: EvidenceType[]
  trust_weights: Record<string, number>
  intelligence_weights: Record<string, number>
  quality_gates: QualityGateConfig[]
  verification_intervals: Record<ModerationStatus, number>
}

export interface QualityGateConfig {
  name: string
  field: string
  operator: '>=' | '<=' | '==' | '!='
  threshold: any
  critical: boolean
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  evidence_collectors: [
    'company_website',
    'ats_data',
    'career_page',
    'domain_quality',
    'broken_links',
    'duplicate_detection',
    'salary_realism',
    'company_reputation',
    'hiring_regions',
    'visa_support',
    'eor_payroll',
    'prior_intelligence',
  ],
  
  trust_weights: {
    company_website: 20,
    ats_data: 15,
    career_page: 15,
    domain_quality: 10,
    broken_links: 10,
    duplicate_detection: 10,
    salary_realism: 10,
    company_reputation: 10,
  },
  
  intelligence_weights: {
    trust: 25,
    africa: 20,
    salary: 15,
    remote: 15,
    application_simplicity: 10,
    recency: 10,
    ai_confidence: 5,
  },
  
  quality_gates: [
    { name: 'trust_score', field: 'trust_score', operator: '>=', threshold: 40, critical: false },
    { name: 'broken_links', field: 'broken_links', operator: '==', threshold: false, critical: true },
    { name: 'duplicate', field: 'duplicate', operator: '==', threshold: false, critical: true },
    { name: 'salary_realism', field: 'impossible_salary', operator: '==', threshold: false, critical: true },
    { name: 'company_reputation', field: 'scam_reports', operator: '==', threshold: 0, critical: true },
  ],
  
  verification_intervals: {
    pending: 7,
    approved: 30,
    quarantined: 7,
    archived: 90,
    deleted: 0,
  },
}

// ============================================================================
// Utility Types
// ============================================================================

export interface CollectorResult {
  success: boolean
  evidence?: Evidence
  error?: string
  duration_ms: number
}

export interface PipelineResult {
  job_id: string
  evidence: Evidence[]
  scores: JobScores
  moderation: ModerationResult
  investigation: Investigation
  total_duration_ms: number
  success: boolean
  errors: string[]
}
