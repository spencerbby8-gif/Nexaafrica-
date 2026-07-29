import { NextResponse } from 'next/server'
import { isPipelineAuthorized, pipelineAuthConfigured } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { calculateTrustScore } from '@/lib/trust/engine'
import { TRUST_VERSION } from '@/lib/trust/types'

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
    .select('id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at, source, source_id, intelligence, trust_version')
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
      const trust = calculateTrustScore(row as any, { companyJobCount: 0 })
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
