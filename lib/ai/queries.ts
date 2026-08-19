import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// DB row type mirrors job_ai_intelligence table
export interface JobAIIntelligenceRow {
  id: string
  job_id: string
  version: number
  model_version: string

  africa_eligibility: 'explicit' | 'likely' | 'restricted' | 'unknown' | null
  africa_confidence: number | null
  africa_evidence: string | null
  africa_source_urls: string[] | null
  country_restrictions: string[] | null
  visa_sponsorship: 'available' | 'not_available' | 'unknown' | 'conditional' | null
  visa_confidence: number | null
  visa_evidence: string | null

  timezone_requirements: string | null
  timezone_confidence: number | null
  timezone_evidence: string | null

  remote_eligibility: 'fully_remote' | 'hybrid' | 'onsite' | 'unknown' | null
  remote_confidence: number | null
  remote_evidence: string | null

  required_skills: string[] | null
  transferable_skills: string[] | null
  missing_skills: string[] | null
  experience_level: 'entry' | 'mid' | 'senior' | 'executive' | 'unknown' | null
  experience_confidence: number | null

  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_period: string | null
  salary_is_estimated: boolean | null
  salary_transparency: 'disclosed' | 'estimated' | 'undisclosed' | 'unknown' | null
  salary_confidence: number | null
  salary_evidence: string | null

  company_legitimacy: 'verified' | 'likely_legit' | 'unknown' | 'suspicious' | null
  company_confidence: number | null
  company_evidence: string | null

  job_quality: 'high' | 'medium' | 'low' | 'unknown' | null
  job_quality_confidence: number | null
  job_quality_evidence: string | null

  application_difficulty: 'easy' | 'medium' | 'hard' | 'unknown' | null
  hiring_urgency: 'high' | 'medium' | 'low' | 'unknown' | null

  overall_confidence: number | null
  quality_score: number | null
  evidence_urls: string[] | null
  evidence_provenance: string | null
  // [PHASE-4C] per-dimension provenance + model reasoning (jsonb column).
  evidence_refs: Record<string, any> | null
  page_status: number | null
  page_checked_at: string | null
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

async function getSupabaseForAI() {
  // Prefer service client for reliable reads. Anon client (createClient) relies
  // on cookies for auth which may be absent in ISR/revalidate contexts, causing
  // silent empty responses even with "using (true)" RLS policy.
  // Service client bypasses RLS entirely — always returns data if it exists.
  try {
    return createServiceClient() as any
  } catch {
    try {
      return await createClient()
    } catch {
      return createServiceClient() as any
    }
  }
}

export async function getAIIntelligenceForJobs(jobIds: string[]): Promise<Map<string, JobAIIntelligenceRow>> {
  return getAIIntelligenceForJobsInternal(jobIds)
}

export async function getAIIntelligenceWithQueueStatus(jobIds: string[]): Promise<{ aiMap: Map<string, JobAIIntelligenceRow>; queueStatus: Map<string, string>; queueError: Map<string, string | null> }> {
  const aiMap = await getAIIntelligenceForJobsInternal(jobIds)
  // Fetch queue status in parallel to help UI distinguish pending vs missing
  const queueStatus = new Map<string, string>()
  const queueError = new Map<string, string | null>()
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from("ai_processing_queue").select("job_id, status, error").in("job_id", jobIds)
    if (data) for (const row of data as any[]) {
      queueStatus.set(row.job_id, row.status)
      queueError.set(row.job_id, row.error ?? null)
    }
  } catch {}
  return { aiMap, queueStatus, queueError }
}

async function getAIIntelligenceForJobsInternal(jobIds: string[]): Promise<Map<string, JobAIIntelligenceRow>> {
  if (jobIds.length === 0) return new Map()
  // Deduplicate
  const uniqueIds = Array.from(new Set(jobIds))
  const supabase = await getSupabaseForAI()

  try {
    const { data, error } = await supabase
      .from('job_ai_intelligence')
      .select('*')
      .in('job_id', uniqueIds)

    if (error) {
      console.error('[v0] getAIIntelligenceForJobs error', error.message)
      // Try service client fallback
      try {
        const service = createServiceClient()
        const { data: data2, error: err2 } = await service
          .from('job_ai_intelligence')
          .select('*')
          .in('job_id', uniqueIds)
        if (err2) {
          console.error('[v0] getAIIntelligenceForJobs service fallback error', err2.message)
          return new Map()
        }
        const map = new Map<string, JobAIIntelligenceRow>()
        for (const row of (data2 as JobAIIntelligenceRow[]) || []) {
          map.set(row.job_id, row)
        }
        return map
      } catch {
        return new Map()
      }
    }

    const map = new Map<string, JobAIIntelligenceRow>()
    for (const row of (data as JobAIIntelligenceRow[]) || []) {
      map.set(row.job_id, row)
    }
    return map
  } catch (e) {
    console.error('[v0] getAIIntelligenceForJobs exception', e)
    return new Map()
  }
}

export async function getAIIntelligenceForJob(jobId: string): Promise<JobAIIntelligenceRow | null> {
  const map = await getAIIntelligenceForJobs([jobId])
  return map.get(jobId) || null
}

// Helper to enrich jobs list with AI, keeping raw job untouched (separate field)
export type JobWithAI<T = any> = T & { aiIntelligence?: JobAIIntelligenceRow | null }

export async function enrichJobsWithAI<T extends { id: string }>(jobs: T[]): Promise<JobWithAI<T>[]> {
  if (jobs.length === 0) return []
  const ids = jobs.map((j) => j.id)
  const aiMap = await getAIIntelligenceForJobs(ids)
  return jobs.map((job) => ({
    ...job,
    aiIntelligence: aiMap.get(job.id) || null,
  }))
}
