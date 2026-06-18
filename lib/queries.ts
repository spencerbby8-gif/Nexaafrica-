import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Category, Job, JobFilters } from '@/lib/types'

const JOB_COLUMNS =
  'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, intelligence, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at'

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
 * Returns counts of jobs added recently. Each filter is independently
 * accurate so we can render either a single line or a multi-segment row.
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
      .gte('created_at', since),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_open_to_africa', true)
      .gte('created_at', since),
  ])

  return {
    addedThisWeek: weekRes.count ?? 0,
    openToAfricaThisWeek: africaRes.count ?? 0,
  }
}
