import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Operational visibility for the founder. Returns the most recent run per
 * source plus a global health summary. Token-protected so the data isn't
 * publicly enumerable.
 */
export async function GET(req: Request) {
  const token = process.env.INGEST_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'INGEST_TOKEN not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Pull the most recent 200 run rows; collapse to latest per source.
  const { data: runs, error } = await supabase
    .from('ingest_runs')
    .select('source, ok, fetched, inserted, skipped, rejected, error, ran_at')
    .order('ran_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const latestPerSource = new Map<string, (typeof runs)[number]>()
  for (const r of runs ?? []) {
    if (!latestPerSource.has(r.source)) latestPerSource.set(r.source, r)
  }
  const sources = Array.from(latestPerSource.values()).sort((a, b) =>
    a.source.localeCompare(b.source),
  )

  // Active job stats for sanity-checking what's actually live.
  const { count: activeCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  const failing = sources.filter((s) => !s.ok)
  const empty = sources.filter((s) => s.ok && s.fetched === 0)

  return NextResponse.json({
    activeJobs: activeCount ?? 0,
    sources: sources.length,
    failing: failing.length,
    emptyFeeds: empty.length,
    latest: sources,
  })
}
