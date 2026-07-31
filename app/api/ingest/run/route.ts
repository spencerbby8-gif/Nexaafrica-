import { NextResponse } from 'next/server'
import { isPipelineAuthorized } from '@/lib/server/auth'
import { runAllSources, runAllTier1 } from '@/lib/ingest/run'
import type { AtsKind } from '@/lib/ingest/companies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Triggered by Vercel cron (daily) or manually with the INGEST_TOKEN.
 * Tier 1: ATS + Remote Boards (RemoteOK, Himalayas, Remotive, WWR)
 */
async function handle(req: Request): Promise<Response> {
  if (!isPipelineAuthorized(req)) {
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

  // ── Trigger AI queue drain after ingestion ────────────────────────
  // Ingestion creates new queue items. Fold the AI drain trigger here so
  // the 04:00 ingest cron also starts processing (doubling daily triggers
  // without adding a third cron on the Hobby 2-cron limit).
  let drainTriggered = false
  if (totals.inserted > 0 && elapsedMs < 270_000) {
    try {
      const drainUrl = new URL(req.url)
      drainUrl.pathname = '/api/ai/process'
      drainUrl.searchParams.set('batch', '100')
      drainUrl.searchParams.set('chain', '0')
      const auth = req.headers.get('authorization') ?? ''
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      await fetch(drainUrl.toString(), {
        method: 'POST',
        headers: { authorization: auth },
        signal: ctrl.signal,
      }).catch(() => {})
      clearTimeout(t)
      drainTriggered = true
    } catch {}
  }

  return NextResponse.json(
    {
      ok: true,
      elapsedMs,
      tier,
      sources: results.length,
      totals,
      drainTriggered,
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
