import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/types'

const JOB_COLUMNS =
  'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, employment_type, tags, is_remote, is_open_to_africa, created_at, expires_at'

/**
 * Returns the set of job ids the current user has saved.
 * Empty set when signed out or on error — never throws.
 */
export async function getSavedJobIds(jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Set()

  const { data, error } = await supabase
    .from('saved_jobs')
    .select('job_id')
    .eq('user_id', user.id)
    .in('job_id', jobIds)

  if (error) {
    console.error('[v0] getSavedJobIds error', error.message)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.job_id as string))
}

export async function isJobSaved(jobId: string): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('saved_jobs')
    .select('id')
    .eq('user_id', user.id)
    .eq('job_id', jobId)
    .maybeSingle()
  if (error) {
    console.error('[v0] isJobSaved error', error.message)
    return false
  }
  return Boolean(data)
}

/**
 * Returns the user's saved jobs, newest-saved first.
 * Hides jobs that have been deactivated since saving.
 */
export async function getSavedJobs(): Promise<Job[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('saved_jobs')
    .select(`created_at, jobs!inner(${JOB_COLUMNS})`)
    .eq('user_id', user.id)
    .eq('jobs.is_active', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[v0] getSavedJobs error', error.message)
    return []
  }
  // Supabase's typed inner-join returns `jobs` as a single object here.
  return (data ?? []).map((row) => (row as unknown as { jobs: Job }).jobs)
}

export async function getSavedJobsCount(): Promise<number> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 0
  const { count, error } = await supabase
    .from('saved_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if (error) {
    console.error('[v0] getSavedJobsCount error', error.message)
    return 0
  }
  return count ?? 0
}
