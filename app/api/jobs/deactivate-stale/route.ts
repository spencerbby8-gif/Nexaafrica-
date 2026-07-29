import { NextResponse } from 'next/server'
import { runDeactivateStale } from '@/lib/jobs/deactivateStale'
import { isPipelineAuthorized, pipelineAuthConfigured } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Manual entry point for stale-job cleanup (daily execution is folded into
 * /api/ai/process on the Hobby plan's 2-cron limit). Logic lives in
 * lib/jobs/deactivateStale so both paths share one implementation.
 */
export async function POST(req: Request) {
  if (!pipelineAuthConfigured()) {
    return NextResponse.json(
      { error: 'No auth secret configured (CRON_SECRET or INGEST_TOKEN)' },
      { status: 500 },
    )
  }
  if (!isPipelineAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = Number(url.searchParams.get('days')) || 60
  const notSeenDays = Number(url.searchParams.get('notSeenDays')) || 14

  try {
    const result = await runDeactivateStale(days, notSeenDays)
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}

export const GET = POST
