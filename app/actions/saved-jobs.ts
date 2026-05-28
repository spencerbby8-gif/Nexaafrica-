'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result =
  | { ok: true; saved: boolean }
  | { ok: false; error: 'unauthorized' | 'not_found' | 'unknown' }

/**
 * Toggle a job in the current user's saved list.
 * Idempotent: calling twice with the same jobId returns to the original state.
 */
export async function toggleSavedJob(jobId: string): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Verify the job exists. We don't need to check is_active here — users are
  // allowed to keep saved roles even after deactivation; we just hide them
  // from the saved list view.
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .maybeSingle()
  if (jobErr || !job) return { ok: false, error: 'not_found' }

  const { data: existing, error: existErr } = await supabase
    .from('saved_jobs')
    .select('id')
    .eq('user_id', user.id)
    .eq('job_id', jobId)
    .maybeSingle()
  if (existErr) return { ok: false, error: 'unknown' }

  if (existing) {
    const { error: delErr } = await supabase
      .from('saved_jobs')
      .delete()
      .eq('id', existing.id)
    if (delErr) return { ok: false, error: 'unknown' }
    revalidatePath('/saved')
    return { ok: true, saved: false }
  }

  const { error: insErr } = await supabase
    .from('saved_jobs')
    .insert({ user_id: user.id, job_id: jobId })
  if (insErr) return { ok: false, error: 'unknown' }
  revalidatePath('/saved')
  return { ok: true, saved: true }
}
