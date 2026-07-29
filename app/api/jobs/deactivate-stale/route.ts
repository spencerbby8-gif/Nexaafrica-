import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stale-job cleanup — Job Refresh Engine version.
 * Uses REAL freshness signals, not ingestion time:
 *   1. expires_at is in past => expired
 *   2. posted_at (real provider date) < threshold (default 60d) => stale
 *   3. last_seen_at < not_seen_threshold (14d) AND posted_at < threshold => not seen in feed recently, deactivated
 *
 * SEO God Mode: deactivating stale jobs keeps sitemap fresh, crawl budget efficient, and counts accurate.
 * Deterministic, observable, safe — uses DB function that returns counts, logs to ingest_runs style.
 */
export async function POST(req: Request) {
  const ingestToken = process.env.INGEST_TOKEN
  const cronSecret = process.env.CRON_SECRET
  if (!ingestToken && !cronSecret) {
    return NextResponse.json(
      { error: 'No auth secret configured (INGEST_TOKEN or CRON_SECRET)' },
      { status: 500 },
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  const authorized =
    (ingestToken && auth === `Bearer ${ingestToken}`) ||
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    req.headers.get('x-vercel-cron') === '1' // Vercel Cron sends this header
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get('days')) || 60))
  const notSeenDays = Math.max(7, Math.min(90, Number(url.searchParams.get('notSeenDays')) || 14))

  const supabase = createServiceClient()

  // Try new function first (if migration applied), fallback to manual logic
  const { data: funcData, error: funcError } = await supabase.rpc('deactivate_stale_jobs', {
    threshold_days: days,
    not_seen_days: notSeenDays,
  })

  if (!funcError && funcData && funcData.length > 0) {
    const row = funcData[0] as any
    return NextResponse.json({
      ok: true,
      deactivated: {
        expired: row.expired_count || 0,
        stale: row.stale_count || 0,
        notSeen: row.not_seen_count || 0,
        total: (row.expired_count || 0) + (row.stale_count || 0) + (row.not_seen_count || 0),
      },
      thresholds: { postedAtDays: days, notSeenDays },
      ranAt: new Date().toISOString(),
      method: 'rpc',
    })
  }

  // Fallback manual (if function not yet migrated)
  const cutoffPosted = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const cutoffSeen = new Date(Date.now() - notSeenDays * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  const [expiredRes, staleRes, notSeenRes] = await Promise.all([
    supabase
      .from('jobs')
      .update({ is_active: false })
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .lt('expires_at', nowIso)
      .select('id'),
    supabase
      .from('jobs')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('posted_at', cutoffPosted)
      .select('id'),
    supabase
      .from('jobs')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('last_seen_at', cutoffSeen)
      .lt('posted_at', cutoffPosted)
      .select('id'),
  ])

  if (expiredRes.error || staleRes.error || notSeenRes.error) {
    return NextResponse.json(
      {
        error: expiredRes.error?.message ?? staleRes.error?.message ?? notSeenRes.error?.message,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    deactivated: {
      expired: expiredRes.data?.length ?? 0,
      stale: staleRes.data?.length ?? 0,
      notSeen: notSeenRes.data?.length ?? 0,
      total: (expiredRes.data?.length ?? 0) + (staleRes.data?.length ?? 0) + (notSeenRes.data?.length ?? 0),
    },
    thresholds: { postedAtDays: days, notSeenDays },
    ranAt: nowIso,
    method: 'manual',
  })
}

export const GET = POST

