import { createServiceClient } from '@/lib/supabase/service'

export interface DeactivateResult {
  deactivated: { expired: number; stale: number; notSeen: number; deadPage: number; total: number }
  thresholds: { postedAtDays: number; notSeenDays: number }
  method: 'rpc' | 'manual'
}

/**
 * Shared stale-job cleanup used by /api/jobs/deactivate-stale and folded into
 * the daily AI-process cron (Hobby plan only allows 2 cron jobs, so the
 * standalone deactivate cron entry had to be merged into an existing one).
 */
export async function runDeactivateStale(days = 60, notSeenDays = 14): Promise<DeactivateResult> {
  const thresholdDays = Math.max(7, Math.min(365, days))
  const notSeen = Math.max(7, Math.min(90, notSeenDays))
  const supabase = createServiceClient()

  const { data: funcData, error: funcError } = await supabase.rpc('deactivate_stale_jobs', {
    threshold_days: thresholdDays,
    not_seen_days: notSeen,
  })

  if (!funcError && funcData && funcData.length > 0) {
    const row = funcData[0] as Record<string, number>
    const expired = row.expired_count || 0
    const stale = row.stale_count || 0
    const notSeenCount = row.not_seen_count || 0
    // P6: deactivate listings with confirmed-dead pages (404/410).
    // Two-step: find dead-page job IDs, then deactivate.
    let deadPage = 0
    try {
      const { data: deadIds } = await supabase
        .from('job_ai_intelligence')
        .select('job_id')
        .in('page_status', [404, 410])
      const ids = (deadIds || []).map((r: any) => r.job_id).filter(Boolean)
      if (ids.length > 0) {
        const { data: dp } = await supabase
          .from('jobs')
          .update({ is_active: false })
          .eq('is_active', true)
          .in('id', ids)
          .select('id')
        deadPage = dp?.length ?? 0
      }
    } catch {}

    return {
      deactivated: { expired, stale, notSeen: notSeenCount, deadPage, total: expired + stale + notSeenCount + deadPage },
      thresholds: { postedAtDays: thresholdDays, notSeenDays: notSeen },
      method: 'rpc',
    }
  }

  const cutoffPosted = new Date(Date.now() - thresholdDays * 86_400_000).toISOString()
  const cutoffSeen = new Date(Date.now() - notSeen * 86_400_000).toISOString()
  const nowIso = new Date().toISOString()

  const [expiredRes, staleRes, notSeenRes] = await Promise.all([
    supabase.from('jobs').update({ is_active: false }).eq('is_active', true).not('expires_at', 'is', null).lt('expires_at', nowIso).select('id'),
    supabase.from('jobs').update({ is_active: false }).eq('is_active', true).lt('posted_at', cutoffPosted).select('id'),
    supabase.from('jobs').update({ is_active: false }).eq('is_active', true).lt('last_seen_at', cutoffSeen).lt('posted_at', cutoffPosted).select('id'),
  ])

  if (expiredRes.error || staleRes.error || notSeenRes.error) {
    throw new Error(expiredRes.error?.message ?? staleRes.error?.message ?? notSeenRes.error?.message)
  }

  const expired = expiredRes.data?.length ?? 0
  const stale = staleRes.data?.length ?? 0
  const notSeenCount = notSeenRes.data?.length ?? 0
  return {
    deactivated: { expired, stale, notSeen: notSeenCount, deadPage: 0, total: expired + stale + notSeenCount },
    thresholds: { postedAtDays: thresholdDays, notSeenDays: notSeen },
    method: 'manual',
  }
}
