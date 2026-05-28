import { NextResponse } from 'next/server'
import { runAllSources } from '@/lib/ingest/run'
import type { AtsKind } from '@/lib/ingest/companies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Triggered by Vercel cron (daily) or manually with the INGEST_TOKEN.
 * Cron requests are authorized by Vercel's standard header. Manual
 * requests must include `Authorization: Bearer <INGEST_TOKEN>`.
 *
 * Optional filter via `?ats=greenhouse` to run a single provider when
 * debugging without hammering every feed.
 */
function isAuthorized(req: Request): boolean {
  // Vercel cron sends this header automatically.
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const atsFilter = url.searchParams.get('ats') as AtsKind | null

  const started = Date.now()
  const results = await runAllSources(
    atsFilter ? (s) => s.ats === atsFilter : undefined,
  )
  const elapsedMs = Date.now() - started

  const totals = results.reduce(
    (acc, r) => {
      acc.fetched += r.fetched
      acc.inserted += r.inserted
      acc.skipped += r.skipped
      acc.rejected += r.rejected
      if (!r.ok) acc.failed += 1
      return acc
    },
    { fetched: 0, inserted: 0, skipped: 0, rejected: 0, failed: 0 },
  )

  return NextResponse.json(
    {
      ok: true,
      elapsedMs,
      sources: results.length,
      totals,
      results,
    },
    { status: 200 },
  )
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
