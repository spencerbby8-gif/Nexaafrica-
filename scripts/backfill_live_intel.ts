/**
 * One-off production backfill (issue #4): populate jobs.intelligence and
 * trust_signals for rows still carrying the empty default ('{}' / '[]').
 * Uses the REAL deterministic engine (lib/intelligence.ts) and trust engine
 * (lib/trust/engine.ts) — no SQL guesswork, no invented data.
 *
 * Run: SUPABASE_DATABASE_CONNECTION_STRING=... npx tsx scripts/backfill_live_intel.ts
 */
import { Pool } from 'pg'
import { extractIntelligence, formatSalary } from '../lib/intelligence'
import { calculateTrustScore } from '../lib/trust/engine'

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_CONNECTION_STRING })

async function main() {
  const batch = Number(process.env.BATCH ?? 5000)
  const { rows } = await pool.query(
    `SELECT id, title, description_md, location, tags, employment_type, salary_range
       FROM jobs WHERE intelligence::text = '{}'::text
       ORDER BY created_at ASC LIMIT $1`, [batch])
  console.log(`rows to backfill: ${rows.length}`)
  let done = 0, salaryFilled = 0
  for (const r of rows) {
    const intelligence = extractIntelligence(
      { title: r.title, description: r.description_md, location: r.location, tags: r.tags || [] },
      r.employment_type && r.employment_type !== 'unknown' ? r.employment_type : null,
    )
    const sal = intelligence.salary
    const salaryRange = r.salary_range ?? formatSalary(sal)
    if (sal && formatSalary(sal)) salaryFilled++
    const trust = calculateTrustScore({
      id: r.id, slug: '', title: r.title, company: '', company_logo: null,
      description_md: r.description_md, apply_url: '', category: 'other',
      location: r.location, country: 'Worldwide', salary_range: salaryRange,
      salary_min: sal?.min ?? null, salary_max: sal?.max ?? null,
      salary_currency: sal?.currency ?? null, salary_period: sal?.period ?? null,
      employment_type: intelligence.employment_type, intelligence, tags: r.tags || [],
      is_remote: true, is_open_to_africa: true, eligibility: 'unknown',
      posted_at: new Date().toISOString(), created_at: new Date().toISOString(),
      expires_at: null, source: null, source_id: null,
    } as any, { companyJobCount: 0 })
    await pool.query(
      `UPDATE jobs SET
          intelligence = $2::jsonb, employment_type = $3,
          salary_min = $4, salary_max = $5, salary_currency = $6, salary_period = $7,
          salary_range = COALESCE(salary_range, $8),
          trust_score = $9, trust_confidence = $10, trust_signals = $11::jsonb,
          trust_version = $12, is_flagged = $13, flagged_reason = $14
        WHERE id = $1`,
      [r.id, JSON.stringify(intelligence), intelligence.employment_type,
       sal?.min ?? null, sal?.max ?? null, sal?.currency ?? null, sal?.period ?? null, salaryRange,
       trust.score, trust.confidence, JSON.stringify(trust.signals), trust.version,
       trust.isFlagged, trust.flaggedReason ?? null])
    done++
  }
  console.log(`backfilled: ${done} | salary newly extracted: ${salaryFilled}`)
  await pool.end()
}
main().catch((e) => { console.error('BACKFILL FAILED:', e); process.exit(1) })
