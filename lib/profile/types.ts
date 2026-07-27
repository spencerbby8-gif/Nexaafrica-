export type ProfileStatus = 'incomplete' | 'parsing' | 'ready' | 'failed'

export interface ProfileExperience {
  id?: string
  title: string
  company: string
  start_date: string | null
  end_date: string | null
  description: string | null
  position?: number
}

export interface ProfileRecord {
  id: string
  full_name: string | null
  country: string | null
  headline: string | null
  summary: string | null
  cv_storage_path: string | null
  raw_cv_text?: string | null
  share_token?: string | null
  status: ProfileStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ParsedProfile {
  headline: string
  summary: string
  skills: string[]
  experience: ProfileExperience[]
}

export interface PipelineMetadata {
  parserModel: string
  reviewerModel: string | null
  reviewerApplied: boolean
  validationPassed: boolean
  validationConfidence: number
  consistencyPassed: boolean
  consistencyScore: number
  atsScore: number | null
  qualityScore: number
  reviewerChanges: Array<{ field: string; before: string; after: string }>
  consistencyIssues: Array<{ field: string; type: string; message: string }>
  tokenUsage: { input: number; output: number }
  timings: { pdfExtractionMs: number; geminiMs: number; validationMs: number; cerebrasMs: number; consistencyMs: number; totalMs: number }
}
