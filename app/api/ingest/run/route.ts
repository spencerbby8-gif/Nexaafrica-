import { NextResponse } from 'next/server'
import { runAllSources, runAllTier1 } from '@/lib/ingest/run'
import type { AtsKind } from '@/lib/ingest/companies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Triggered by Vercel cron (daily) or manually with the INGEST_TOKEN.
 * Tier 1: ATS + Remote Boards (RemoteOK, Himalayas, Remotive, WWR)
 */
function isAuthorized(req: Request): boolean {
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
  const tier = url.searchParams.get('tier') || '1'

  const started = Date.now()
  const results = tier === '1'
    ? await runAllTier1()
    : await runAllSources(
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
      tier,
      sources: results.length,
      totals,
      results: results.slice(0, 100), // limit response size
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
