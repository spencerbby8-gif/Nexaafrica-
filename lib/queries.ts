import 'server-only'
import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import type { Category, Job, JobFilters } from '@/lib/types'
import { getAIIntelligenceForJobs, getAIIntelligenceWithQueueStatus, type JobAIIntelligenceRow, type JobWithAI } from '@/lib/ai/queries'
import { VERIFIED_MIN_QUALITY } from '@/lib/ai/verified'

import { JOB_COLUMNS } from '@/lib/jobs/columns'
import { getPublicJobsPage } from '@/lib/jobs/public-feed'
import { isPublicJob } from '@/lib/jobs/public-policy'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function freshIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function getJobs(filters: JobFilters = {}): Promise<Job[]> {
  return (await getPublicJobsPage(filters)).jobs
}

export async function getJobBySlug(slug: string): Promise<Job | null> {
  const supabase = await createClient()
  // Allow direct-link access even when deactivated, but never index it
  // (handled at the route level via metadata).
  const { data, error } = await supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('[v0] getJobBySlug error', error.message)
    return null
  }
  return (data as Job) ?? null
}

export async function getJobBySlugWithAI(slug: string): Promise<JobWithAI<Job> | null> {
  const job = await getJobBySlug(slug)
  if (!job) return null
  try {
    const { aiMap, queueStatus, queueError } = await getAIIntelligenceWithQueueStatus([job.id])
    const result = { ...job, aiIntelligence: aiMap.get(job.id) || null, _queueStatus: queueStatus.get(job.id) || null, _queueError: queueError.get(job.id) ?? null }
    return isPublicJob(result) ? result as any : null
  } catch {
    return null // fail closed if eligibility cannot be checked
  }
}

export async function getRelatedJobs(job: Job, limit = 4): Promise<Job[]> {
  return (await getPublicJobsPage({category: job.category, limit: limit + 1})).jobs.filter(j => j.id !== job.id).slice(0, limit)
}
export async function getRelatedJobsWithAI(job: Job, limit = 4): Promise<JobWithAI<Job>[]> {
  return getRelatedJobs(job, limit) as Promise<JobWithAI<Job>[]>
}
export async function getJobsWithAI(filters: JobFilters = {}): Promise<JobWithAI<Job>[]> {
  return (await getPublicJobsPage(filters)).jobs
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('slug, title, description')
    .order('title', { ascending: true })
  if (error) {
    console.error('[v0] getCategories error', error.message)
    return []
  }
  return (data ?? []) as Category[]
}

export async function getCategory(slug: string): Promise<Category | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('slug, title, description')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('[v0] getCategory error', error.message)
    return null
  }
  return (data as Category) ?? null
}

export const countJobs = cache(async function countJobs(filters: JobFilters = {}): Promise<number> {
  const supabase = await createClient()
  let query = supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.country) query = query.ilike('country', filters.country)
  if (filters.remoteOnly) query = query.eq('is_remote', true)
  if (filters.openToAfrica) query = query.eq('is_open_to_africa', true)
  if (filters.employmentType) query = query.eq('employment_type', filters.employmentType)
  if (filters.freshDays && filters.freshDays > 0) {
    query = query.gte('posted_at', freshIso(filters.freshDays))
  }
  const { count, error } = await query
  if (error) {
    console.error('[v0] countJobs error', error.message)
    return 0
  }
  return count ?? 0
})

export async function getDistinctCountriesForCategory(category: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('country')
    .eq('is_active', true)
    .eq('category', category)
    .limit(500)
  if (error) {
    console.error('[v0] getDistinctCountriesForCategory error', error.message)
    return []
  }
  const set = new Set<string>()
  for (const row of data ?? []) {
    if (row.country) set.add(row.country as string)
  }
  return Array.from(set).sort()
}

/**
 * Lightweight platform pulse for the homepage.
 * Uses posted_at (real provider date) for freshness, not created_at (ingestion time),
 * per Job Refresh Engine requirement: freshness scoring using real posted dates.
 */
export const getFreshnessPulse = cache(async function getFreshnessPulse(): Promise<{
  addedThisWeek: number
  openToAfricaThisWeek: number
}> {
  const supabase = await createClient()
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

  const [weekRes, africaRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('posted_at', since),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_open_to_africa', true)
      .gte('posted_at', since),
  ])

  return {
    addedThisWeek: weekRes.count ?? 0,
    openToAfricaThisWeek: africaRes.count ?? 0,
  }
})

// ─── Live Proof Layer queries (P7) ──────────────────────────────────

/**
 * Active jobs with real AI intelligence, recently verified by a live model.
 * model_version contains ':' (provider:model) and is not regex-era.
 */
export const getVerifiedJobs = cache(async function getVerifiedJobs(limit = 8): Promise<JobWithAI<Job>[]> {
  return (await getPublicJobsPage({limit, verifiedOnly: true})).jobs
})

export const getProofStats = cache(async function getProofStats(): Promise<{
  totalActive: number
  verified: number
  queued: number
  stale: number
  aiCoveragePct: number
  queueDepth: number
}> {
  const supabase = await createClient()
  const svc = createServiceClient()
  const [activeCount, aiCount, queueCount, staleCount] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true),
    // [PROOF-TRUTH] Verified/rule-based counts are ACTIVE-JOBS ONLY: join
    // through the FK so rows belonging to deactivated jobs never inflate the
    // coverage the site claims.
    // [PHASE-2] Canonical verified contract: quality_score >= VERIFIED_MIN_QUALITY.
    svc.from('job_ai_intelligence').select('job_id, jobs!inner(is_active)', { count: 'exact', head: true }).like('model_version', '%:%').not('model_version', 'like', 'regex%').gte('quality_score', VERIFIED_MIN_QUALITY).eq('jobs.is_active', true),
    svc.from('ai_processing_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('job_ai_intelligence').select('job_id, jobs!inner(is_active)', { count: 'exact', head: true }).or('model_version.like.regex%,model_version.like.no-ai%').eq('jobs.is_active', true),
  ])
  const totalActive = activeCount.count ?? 0
  const verified = aiCount.count ?? 0
  const queued = queueCount.count ?? 0
  const stale = staleCount.count ?? 0
  return {
    totalActive,
    verified,
    queued,
    stale,
    aiCoveragePct: totalActive > 0 ? Math.round((verified / totalActive) * 100) : 0,
    queueDepth: queued,
  }
})

/**
 * [V2.1] Company learning row for the role page (company_intelligence).
 * Read-only lookup — returns null when the learning layer has no row.
 */
export async function getCompanyIntel(company: string): Promise<Record<string, any> | null> {
  if (!company) return null
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from('company_intelligence')
      .select('*')
      .eq('company', company)
      .maybeSingle()
    return (data as Record<string, any>) || null
  } catch {
    return null
  }
}

/**
 * [V2.1] Source learning row for the role page (source_intelligence).
 * Read-only lookup — returns null when the learning layer has no row.
 */
export async function getSourceIntel(source: string | null | undefined): Promise<Record<string, any> | null> {
  if (!source) return null
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from('source_intelligence')
      .select('*')
      .eq('source', source)
      .maybeSingle()
    return (data as Record<string, any>) || null
  } catch {
    return null
  }
}
