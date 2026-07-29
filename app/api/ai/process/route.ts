import { NextResponse } from 'next/server'
import { processAIQueue } from '@/lib/ai/engine'
import { runDeactivateStale } from '@/lib/jobs/deactivateStale'
import { isPipelineAuthorized, pipelineAuthConfigured } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  if (!pipelineAuthConfigured()) {
    return NextResponse.json(
      { error: 'No auth secret configured (CRON_SECRET or INGEST_TOKEN)' },
      { status: 500 },
    )
  }
  if (!isPipelineAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const batch = Math.max(1, Math.min(150, Number(url.searchParams.get('batch')) || 50))

  const started = Date.now()
  const result = await processAIQueue(batch)

  // Hobby plan allows only 2 cron entries, so the standalone
  // /api/jobs/deactivate-stale cron (06:00) never ran. It is folded in here:
  // the engine self-caps at ~240s, leaving budget for this quick DB sweep.
  let stale: unknown = null
  try {
    stale = await runDeactivateStale()
  } catch (e) {
    stale = { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }

  const elapsedMs = Date.now() - started
  return NextResponse.json({ ok: true, elapsedMs, ...result, stale }, { status: 200 })
}

export const GET = POST
