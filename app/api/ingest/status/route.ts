import { NextResponse } from 'next/server'
import { isPipelineAuthorized, pipelineAuthConfigured } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { calculateSourceHealth, getOverallHealth } from '@/lib/ingest/sourceHealth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Operational visibility for the founder. Returns the most recent run per
 * source plus a global health summary. Token-protected so the data isn't
 * publicly enumerable.
 * Fixed to use created_at (not ran_at) and to provide health scoring.
 */
export async function GET(req: Request) {
  if (!pipelineAuthConfigured()) {
    return NextResponse.json({ error: 'No auth secret configured (CRON_SECRET or INGEST_TOKEN)' }, { status: 500 })
  }
  if (!isPipelineAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Pull the most recent 500 run rows; collapse to latest per source.
  // Support both created_at (new) and ran_at (old) for backward compat.
  const { data: runs, error } = await supabase
    .from('ingest_runs')
    .select('source, ok, fetched, inserted, skipped, rejected, error, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const health = calculateSourceHealth((runs as any) || [])
  const overall = getOverallHealth(health)

  // Active job stats for sanity-checking what's actually live.
  const { count: activeCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  const { count: staleCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .lt('posted_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

  return NextResponse.json({
    activeJobs: activeCount ?? 0,
    staleJobs: staleCount ?? 0,
    ...overall,
    sources: health,
    latest: health.slice(0, 50),
  })
}
