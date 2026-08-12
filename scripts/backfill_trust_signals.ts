/**
 * [V1-HONESTY] Re-persist trust signals for ALL active jobs using LIVE
 * learning context, so persisted jobs.trust_signals match what the role page
 * renders. Fixes the ingest-time snapshot drift found in the 2026-08-12 deep
 * audit:
 *   F2 - persisted company_history counts contradicted the live panel
 *        (Stripe card "645 roles" vs panel "659 roles");
 *   F3 - persisted signals were computed with the OLD company_learning logic
 *        (or none at all), and the honest signal never rendered.
 *
 * Uses the REAL trust engine with live company_intelligence +
 * source_intelligence + freshly counted active jobs per company. Chunked at
 * 250 rows/request (PostgREST silently caps at 1,000 — see docs). Idempotent:
 * safe to re-run after any learning refresh.
 *
 * Usage (operator only):
 *   DRY=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/backfill_trust_signals.ts
 *
 * DRY=1 computes + prints a summary and writes NOTHING.
 */
import { createServiceClient } from '../lib/supabase/service'
import { calculateTrustScore } from '../lib/trust/engine'

const DRY = process.env.DRY === '1'

async function fetchAll<T = any>(sb: any, table: string, select: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`fetch ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return rows
}

async function main(): Promise<void> {
  const sb = createServiceClient()
  const started = Date.now()

  console.log('[backfill] fetching active jobs (paginated)...')
  const jobs = await fetchAll<any>(sb, 'jobs',
    'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at, source, source_id'
  )
  console.log(`[backfill] active jobs: ${jobs.length}`)

  const [ciRows, siRows] = await Promise.all([
    fetchAll<any>(sb, 'company_intelligence', '*'),
    fetchAll<any>(sb, 'source_intelligence', '*'),
  ])
  const ciMap = new Map<string, any>()
  for (const c of ciRows) ciMap.set(String(c.company).toLowerCase(), c)
  const siMap = new Map<string, any>()
  for (const s of siRows) siMap.set(String(s.source).toLowerCase(), s)
  console.log(`[backfill] company_intelligence rows: ${ciRows.length}, source_intelligence rows: ${siRows.length}`)

  // Live per-company active counts (from the same fresh fetch — no extra queries)
  const countByCompany = new Map<string, number>()
  for (const j of jobs) {
    const k = String(j.company || '').toLowerCase()
    countByCompany.set(k, (countByCompany.get(k) || 0) + 1)
  }

  const rows: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    const companyLower = String(job.company || '').toLowerCase()
    const ci = ciMap.get(companyLower) || null
    const si = siMap.get(String(job.source || '').toLowerCase()) || null
    const trust = calculateTrustScore(job as any, {
      companyJobCount: countByCompany.get(companyLower) || 0,
      companyIntel: ci,
      sourceIntel: si,
    })
    rows.push({
      id: job.id,
      trust_score: trust.score,
      trust_confidence: trust.confidence,
      trust_signals: trust.signals,
      trust_version: trust.version,
      is_flagged: trust.isFlagged,
      flagged_reason: trust.flaggedReason,
    })
  }

  // Summary (also the dry-run output)
  const byTone = new Map<string, number>()
  const learningLabels = new Map<string, number>()
  for (const r of rows) {
    for (const s of (r.trust_signals as Array<{ tone: string; label: string }>)) {
      byTone.set(s.tone, (byTone.get(s.tone) || 0) + 1)
      if (s.label.includes('Limited') || s.label.includes('Rarely') || s.label.includes('rejection') || s.label.includes('Source track') || s.label.includes('hiring health')) {
        learningLabels.set(s.label, (learningLabels.get(s.label) || 0) + 1)
      }
    }
  }
  const low = rows.filter((r) => Number(r.trust_score) < 40).length
  console.log(`[backfill] computed ${rows.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log('[backfill] signals by tone:', JSON.stringify(Object.fromEntries(byTone)))
  console.log('[backfill] learning signals:', JSON.stringify(Object.fromEntries(learningLabels)))
  console.log(`[backfill] trust<40: ${low} (${(100 * low / Math.max(1, rows.length)).toFixed(1)}%)`)

  if (DRY) {
    console.log('[backfill] DRY RUN — nothing written')
    return
  }

  let updated = 0
  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250)
    const { error } = await sb.from('jobs').upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`upsert chunk ${i / 250}: ${error.message}`)
    updated += chunk.length
    console.log(`[backfill] upserted ${updated}/${rows.length}`)
  }
  console.log(`[backfill] DONE updated=${updated} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error('[backfill] FAILED:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
