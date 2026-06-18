import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  extractIntelligence,
  formatSalary,
  INTELLIGENCE_VERSION,
} from '@/lib/intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Phase 16 backfill. Recomputes the deterministic intelligence store for
 * existing jobs that were ingested before the engine existed (or before the
 * current INTELLIGENCE_VERSION). Idempotent and resumable: it only touches
 * rows whose intelligence is missing/stale, in batches, so it can be invoked
 * repeatedly (e.g. by cron) until `remaining` reaches 0.
 *
 * Auth: same bearer-token model as the other maintenance endpoints
 * (INGEST_TOKEN or CRON_SECRET).
 *
 * Safety: never invents data. Recomputes salary_* / employment_type /
 * intelligence purely from each row's OWN stored text. Leaves all other
 * columns untouched.
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
  const batch = Math.max(50, Math.min(1000, Number(url.searchParams.get('batch')) || 500))
  const activeOnly = url.searchParams.get('all') !== 'true'

  const supabase = createServiceClient()

  // Select rows whose intelligence is empty or from an older engine version.
  let sel = supabase
    .from('jobs')
    .select('id, title, description_md, location, tags, salary_range, employment_type, intelligence')
    .order('created_at', { ascending: true })
    .limit(batch)
  if (activeOnly) sel = sel.eq('is_active', true)

  const { data: rows, error } = await sel
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows ?? []) {
    const intel = row.intelligence as { version?: number } | null
    if (intel && typeof intel === 'object' && intel.version === INTELLIGENCE_VERSION) {
      skipped += 1
      continue
    }

    const intelligence = extractIntelligence(
      {
        title: row.title as string,
        description: row.description_md as string,
        location: row.location as string | null,
        tags: (row.tags as string[]) ?? [],
      },
      // Preserve a confident pre-existing type; let the engine resolve the rest.
      row.employment_type && row.employment_type !== 'unknown'
        ? (row.employment_type as string)
        : null,
    )
    const sal = intelligence.salary

    const { error: upErr } = await supabase
      .from('jobs')
      .update({
        intelligence,
        employment_type: intelligence.employment_type,
        salary_range: (row.salary_range as string | null) ?? formatSalary(sal),
        salary_min: sal?.min ?? null,
        salary_max: sal?.max ?? null,
        salary_currency: sal?.currency ?? null,
        salary_period: sal?.period ?? null,
      })
      .eq('id', row.id as string)

    if (upErr) {
      errors.push(`${row.id}: ${upErr.message}`)
      continue
    }
    updated += 1
  }

  // Count how many still need processing so the caller knows when to stop.
  let remainingQuery = supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .or(`intelligence->>version.is.null,intelligence->>version.neq.${INTELLIGENCE_VERSION}`)
  if (activeOnly) remainingQuery = remainingQuery.eq('is_active', true)
  const { count: remaining } = await remainingQuery

  return NextResponse.json({
    ok: true,
    version: INTELLIGENCE_VERSION,
    processed: rows?.length ?? 0,
    updated,
    skipped,
    remaining: remaining ?? 0,
    errors,
  })
}

export const GET = POST
