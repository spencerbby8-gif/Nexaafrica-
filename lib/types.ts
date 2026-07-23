import type { JobIntelligence } from '@/lib/intelligence'

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'freelance'
  | 'consultant'
  | 'temporary'
  | 'internship'
  | 'unknown'

/**
 * Eligibility confidence tier for Africa-based applicants. Replaces the old
 * binary is_open_to_africa mindset with an honest, evidence-graded signal:
 * - 'explicit'   — Africa / an African country is explicitly welcomed
 * - 'likely'     — global-remote signals, no restriction detected (a hedge)
 * - 'restricted' — region / work-authorization / country restriction detected
 * - 'unknown'    — insufficient evidence either way
 * is_open_to_africa remains as a derived convenience flag (explicit || likely)
 * so existing filters and hubs keep working without a rename.
 */
export type Eligibility = 'explicit' | 'likely' | 'restricted' | 'unknown'

export interface Job {
  id: string
  slug: string
  title: string
  company: string
  company_logo: string | null
  description_md: string
  apply_url: string
  category: string
  location: string | null
  country: string
  salary_range: string | null
  /** Structured salary (Phase 16). Null when not disclosed. */
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_period: string | null
  employment_type: EmploymentType
  tags: string[]
  is_remote: boolean
  is_open_to_africa: boolean
  eligibility: Eligibility
  /**
   * Persisted, evidence-backed intelligence signal store (Phase 16).
   * Generic JSON so future AI extractors can write the same shape.
   */
  intelligence: JobIntelligence | Record<string, never>
  /** Real provider posting date (ISO). Falls back to created_at when unknown. */
  posted_at: string
  /** Ingestion timestamp — when Nexa first saw the row. Never a posting date. */
  created_at: string
  expires_at: string | null
  // Trust Engine + ingestion metadata (optional, not always selected)
  source?: string | null
  source_id?: string | null
  is_active?: boolean | null
  trust_score?: number | null
  trust_confidence?: string | null
  trust_signals?: any
  trust_version?: number | null
  is_flagged?: boolean | null
  flagged_reason?: string | null
  duplicate_of?: string | null
}

export interface Category {
  slug: string
  title: string
  description: string | null
}

export interface Company {
  id: string
  name: string
  logo: string | null
  website: string | null
  description: string | null
  verified: boolean
}

export interface JobFilters {
  category?: string
  country?: string
  remoteOnly?: boolean
  openToAfrica?: boolean
  usdOnly?: boolean
  employmentType?: EmploymentType
  q?: string
  limit?: number
  freshDays?: number
}
