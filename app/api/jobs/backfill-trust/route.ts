import { NextResponse } from 'next/server'
import { isPipelineAuthorized, pipelineAuthConfigured } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { rescoreTrustSignals } from '@/lib/trust/engine'
import { TRUST_VERSION } from '@/lib/trust/types'

/**
 * [ARCHITECTURE 2026-08-05 — single-owner doctrine] Trust rescore — the
 * WRITE-PATH owner of trust healing for historical rows. Uses the Trust
 * Engine's rescore (current weights + persisted measured-learning entries
 * preserved) and PERSISTS the result; the render layer displays only the
 * stored plane and never self-corrects. Stale truth heals here, not at
 * render. (Preview lane: never executed until authorized post-merge.)
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  if (!pipelineAuthConfigured()) {
    return NextResponse.json({ error: 'No auth secret configured (CRON_SECRET or INGEST_TOKEN)' }, { status: 500 })
  }
  if (!isPipelineAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const batch = Math.max(50, Math.min(1000, Number(url.searchParams.get('batch')) || 500))
  const supabase = createServiceClient()

  const { data: rows, error } = await supabase
    .from('jobs')
    .select('id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at, source, source_id, intelligence, trust_version, trust_signals')
    .eq('is_active', true)
    .or(`trust_version.is.null,trust_version.lt.${TRUST_VERSION}`)
    .order('created_at', { ascending: true })
    .limit(batch)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows ?? []) {
    try {
      // Rescore WITHOUT learning context: stateless signals recompute with
      // current weights; the row's persisted measured-learning entries
      // (company_history / company_learning / source_learning) are kept by
      // the rescore — they encode real history a per-row pass cannot rebuild.
      const trust = rescoreTrustSignals(row as any)
      const { error: upErr } = await supabase
        .from('jobs')
        .update({
          trust_score: trust.score,
          trust_confidence: trust.confidence,
          trust_signals: trust.signals,
          trust_version: trust.version,
          is_flagged: trust.isFlagged,
          flagged_reason: trust.flaggedReason,
        })
        .eq('id', row.id)

      if (upErr) errors.push(`${row.id}: ${upErr.message}`)
      else updated++
    } catch (e) {
      errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Count remaining
  const { count: remaining } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .or(`trust_version.is.null,trust_version.lt.${TRUST_VERSION}`)

  return NextResponse.json({ ok: true, updated, skipped, remaining: remaining || 0, errors: errors.slice(0, 10) })
}

export async function GET(req: Request) {
  return POST(req)
}
