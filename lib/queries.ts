import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import type { Category, Job, JobFilters } from '@/lib/types'
import { getAIIntelligenceForJobs, getAIIntelligenceWithQueueStatus, type JobAIIntelligenceRow, type JobWithAI } from '@/lib/ai/queries'

const JOB_COLUMNS =
  'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, intelligence, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at, trust_score, trust_confidence, trust_signals, trust_version, is_flagged, flagged_reason, source, source_id'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function freshIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function getJobs(filters: JobFilters = {}): Promise<Job[]> {
  const supabase = await createClient()
  let query = supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('is_active', true)
    // Order by the real posting date so the freshest *actual* postings lead,
    // not whichever rows Nexa happened to ingest most recently.
    .order('posted_at', { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.country) query = query.ilike('country', filters.country)
  if (filters.remoteOnly) query = query.eq('is_remote', true)
  if (filters.openToAfrica) query = query.eq('is_open_to_africa', true)
  // USD-paying is a core positioning pillar. salary_range is free text, so
  // match the common ways USD compensation is expressed ($ symbol or "USD").
  if (filters.usdOnly) {
    query = query.or('salary_range.ilike.%$%,salary_range.ilike.%USD%')
  }
  if (filters.employmentType) query = query.eq('employment_type', filters.employmentType)
  if (filters.freshDays && filters.freshDays > 0) {
    query = query.gte('posted_at', freshIso(filters.freshDays))
  }
  if (filters.q) {
    const term = `%${filters.q}%`
    query = query.or(`title.ilike.${term},company.ilike.${term}`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[v0] getJobs error', error.message)
    return []
  }
  return (data ?? []) as Job[]
}

export async function getJobBySlug(slug: string): Promise<Job | null> {
  const supabase = await createClient()
  // Allow direct-link access even when deactivated, but never index it
  // (handled at the route level via metadata).
  const { data, error } = await supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('slug', slug)
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
    const { aiMap, queueStatus } = await getAIIntelligenceWithQueueStatus([job.id])
    return { ...job, aiIntelligence: aiMap.get(job.id) || null, _queueStatus: queueStatus.get(job.id) || null } as any
  } catch {
    return { ...job, aiIntelligence: null, _queueStatus: null } as any
  }
}

export async function getRelatedJobs(job: Job, limit = 4): Promise<Job[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('is_active', true)
    .eq('category', job.category)
    .neq('id', job.id)
    .order('posted_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[v0] getRelatedJobs error', error.message)
    return []
  }
  return (data ?? []) as Job[]
}

export async function getRelatedJobsWithAI(job: Job, limit = 4): Promise<JobWithAI<Job>[]> {
  const jobs = await getRelatedJobs(job, limit)
  if (jobs.length === 0) return []
  try {
    const aiMap = await getAIIntelligenceForJobs(jobs.map((j) => j.id))
    return jobs.map((j) => ({ ...j, aiIntelligence: aiMap.get(j.id) || null }))
  } catch {
    return jobs.map((j) => ({ ...j, aiIntelligence: null }))
  }
}

export async function getJobsWithAI(filters: JobFilters = {}): Promise<JobWithAI<Job>[]> {
  const jobs = await getJobs(filters)
  if (jobs.length === 0) return []
  try {
    const { aiMap, queueStatus } = await getAIIntelligenceWithQueueStatus(jobs.map((j) => j.id))
    return jobs.map((j) => ({ ...j, aiIntelligence: aiMap.get(j.id) || null, _queueStatus: queueStatus.get(j.id) || null } as any))
  } catch {
    return jobs.map((j) => ({ ...j, aiIntelligence: null, _queueStatus: null } as any))
  }
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
    .maybeSingle()
  if (error) {
    console.error('[v0] getCategory error', error.message)
    return null
  }
  return (data as Category) ?? null
}

export async function countJobs(filters: JobFilters = {}): Promise<number> {
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
}

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
export async function getFreshnessPulse(): Promise<{
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
}

// ─── Live Proof Layer queries (P7) ──────────────────────────────────

/**
 * Active jobs with real AI intelligence, recently verified by a live model.
 * model_version contains ':' (provider:model) and is not regex-era.
 */
export async function getVerifiedJobs(limit = 6): Promise<JobWithAI<Job>[]> {
  const supabase = await createClient()
  const svc = createServiceClient()
  const { data: rows } = await svc
    .from('job_ai_intelligence')
    .select('job_id')
    .like('model_version', '%:%')
    .not('model_version', 'like', 'regex%')
    .order('last_verified_at', { ascending: false })
    .limit(limit)
  const ids = (rows || []).map((r: any) => r.job_id).filter(Boolean)
  if (ids.length === 0) return []
  try {
    const { aiMap, queueStatus } = await getAIIntelligenceWithQueueStatus(ids)
    const { data: jobs } = await supabase
      .from('jobs')
      .select(JOB_COLUMNS)
      .in('id', ids)
      .eq('is_active', true)
    return (jobs || []).map((j: any) => ({ ...j, aiIntelligence: aiMap.get(j.id) || null, _queueStatus: queueStatus.get(j.id) || null } as any))
  } catch {
    return []
  }
}

/**
 * Active jobs queued for AI processing but not yet verified (no intelligence
 * row, or queue status pending).
 */
export async function getQueuedJobs(limit = 6): Promise<JobWithAI<Job>[]> {
  const supabase = await createClient()
  // Queue table is RLS-private — use service client to read it
  const svc = createServiceClient()
  const { data: queueRows } = await svc
    .from('ai_processing_queue')
    .select('job_id')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
  const ids = (queueRows || []).map((r: any) => r.job_id).filter(Boolean)
  if (ids.length === 0) return []
  try {
    const { data: jobs } = await supabase
      .from('jobs')
      .select(JOB_COLUMNS)
      .in('id', ids)
      .eq('is_active', true)
      .limit(limit)
    const { aiMap, queueStatus } = await getAIIntelligenceWithQueueStatus(ids)
    return (jobs || []).map((j: any) => ({ ...j, aiIntelligence: aiMap.get(j.id) || null, _queueStatus: queueStatus.get(j.id) || null } as any))
  } catch {
    return []
  }
}

/**
 * Active jobs with stale or regex-era intelligence (not real AI, or old).
 */
export async function getStaleJobs(limit = 6): Promise<JobWithAI<Job>[]> {
  const supabase = await createClient()
  const svc = createServiceClient()
  const { data: rows } = await svc
    .from('job_ai_intelligence')
    .select('job_id')
    .or('model_version.like.regex%,model_version.like.no-ai%')
    .order('last_verified_at', { ascending: true })
    .limit(limit)
  const ids = (rows || []).map((r: any) => r.job_id).filter(Boolean)
  if (ids.length === 0) return []
  try {
    const { data: jobs } = await supabase
      .from('jobs')
      .select(JOB_COLUMNS)
      .in('id', ids)
      .eq('is_active', true)
      .limit(limit)
    const { aiMap, queueStatus } = await getAIIntelligenceWithQueueStatus(ids)
    return (jobs || []).map((j: any) => ({ ...j, aiIntelligence: aiMap.get(j.id) || null, _queueStatus: queueStatus.get(j.id) || null } as any))
  } catch {
    return []
  }
}

/**
 * Aggregate proof stats for the homepage header / admin views.
 */
export async function getProofStats(): Promise<{
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
    svc.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).like('model_version', '%:%').not('model_version', 'like', 'regex%'),
    svc.from('ai_processing_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).or('model_version.like.regex%,model_version.like.no-ai%'),
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
}
