import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Category, Job, JobFilters } from '@/lib/types'

const JOB_COLUMNS =
  'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, employment_type, tags, is_remote, is_open_to_africa, created_at, expires_at'

export async function getJobs(filters: JobFilters = {}): Promise<Job[]> {
  const supabase = await createClient()
  let query = supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.country) query = query.ilike('country', filters.country)
  if (filters.remoteOnly) query = query.eq('is_remote', true)
  if (filters.openToAfrica) query = query.eq('is_open_to_africa', true)
  if (filters.employmentType) query = query.eq('employment_type', filters.employmentType)
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
    .eq('category', job.category)
    .neq('id', job.id)
    .order('created_at', { ascending: false })
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
  let query = supabase.from('jobs').select('id', { count: 'exact', head: true })
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.country) query = query.ilike('country', filters.country)
  if (filters.remoteOnly) query = query.eq('is_remote', true)
  if (filters.openToAfrica) query = query.eq('is_open_to_africa', true)
  if (filters.employmentType) query = query.eq('employment_type', filters.employmentType)
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
