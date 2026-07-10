import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stale-job cleanup. Deactivates roles that meet either rule:
 *   1. expires_at is in the past, OR
 *   2. created_at is older than the staleness threshold (default 60 days).
 *
 * Reads is_active=true rows only so re-runs are idempotent and cheap.
 *
 * Auth model: same bearer-token style as /api/ingest (INGEST_TOKEN). Vercel
 * Cron requests carry the same header when configured via vercel.json.
 *
 * Also accepts Vercel's CRON_SECRET if present, so this endpoint can be
 * hooked up to scheduled crons without sharing the ingest token.
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
    (cronSecret && auth === `Bearer ${cronSecret}`)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = Math.max(7, Math.min(365, Number(url.searchParams.get('days')) || 60))

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  const supabase = createServiceClient()

  // Three passes: expired, old posted_at, old created_at fallback.
  // Using posted_at as primary freshness signal aligns with SEO sitemap
  // logic (which judges staleness on posted_at). created_at remains as
  // safety net for rows where posted_at is still null (pre-migration).
  const [expiredRes, stalePostedRes, staleCreatedRes] = await Promise.all([
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
      .not('posted_at', 'is', null)
      .lt('posted_at', cutoff)
      .select('id'),
    supabase
      .from('jobs')
      .update({ is_active: false })
      .eq('is_active', true)
      .is('posted_at', null)
      .lt('created_at', cutoff)
      .select('id'),
  ])

  const err = expiredRes.error ?? stalePostedRes.error ?? staleCreatedRes.error
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    deactivated: {
      expired: expiredRes.data?.length ?? 0,
      stalePosted: stalePostedRes.data?.length ?? 0,
      staleCreatedFallback: staleCreatedRes.data?.length ?? 0,
      stale: (stalePostedRes.data?.length ?? 0) + (staleCreatedRes.data?.length ?? 0),
    },
    thresholdDays: days,
    ranAt: nowIso,
  })
}

// Vercel Cron Jobs send GET by default; mirror behavior for convenience.
export const GET = POST
