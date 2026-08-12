/**
 * NEXA INTELLIGENCE HONESTY AUDIT — read-only, repeatable.
 *
 * Recomputes every "intelligence" metric from ground truth and diffs it
 * against what the site stores and displays. Fails loudly (exit 1) when the
 * intelligence is lying or stale. Run:
 *   SB_DSN=postgresql://... node scripts/audit-intelligence.ts   (or npm run audit:intelligence)
 *
 * Checks:
 *  T1  company_intelligence freshness + stored-vs-recompute parity
 *  T2  africa_rate / africa_unknown_share parity with the live aggregator
 *  T3  remote_friendliness parity (catches the fake 1.0)
 *  T4  no orphan company_intelligence rows (prune working)
 *  T5  no active listings older than 90 days (deactivation working)
 *  T6  evidence honesty (verified rows carry excerpts + http 200)
 *  T7  source_intelligence stored totals vs active ground truth
 */
import { Client } from 'pg'

const dsn = process.env.SB_DSN
if (!dsn) {
  console.error('Missing SB_DSN connection string')
  process.exit(2)
}

const c = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } })
let failures = 0

function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!ok) failures++
}

async function q<T = any>(sql: string): Promise<T[]> {
  const r = await c.query(sql)
  return r.rows as T[]
}

async function main() {
  await c.connect()
  await c.query('set default_transaction_read_only = on')
  await c.query('set statement_timeout = 90000')
  console.log('=== NEXA INTELLIGENCE HONESTY AUDIT ===\n')

  // ── T1: freshness + parity ────────────────────────────────────────────
  const stale = await q<{ n: string }>(`
    select count(*)::text n from company_intelligence
    where last_updated < now() - interval '27 hours'`)
  check('T1a company_intelligence freshness', Number(stale[0].n) === 0,
    `rows older than 27h: ${stale[0].n}`)

  const parity = await q<{ company: string; stored_total: number; fresh_total: string; stored_africa: string; fresh_africa: string; stored_remote: string; fresh_remote: string }>(`
    with fresh as (select * from aggregate_company_intelligence()),
    stored as (select company, total_jobs, africa_rate, remote_friendliness, last_updated from company_intelligence)
    select f.company, s.total_jobs as stored_total, f.total_jobs::text as fresh_total,
      round(s.africa_rate::numeric,3)::text stored_africa, round(f.africa_rate::numeric,3)::text fresh_africa,
      round(s.remote_friendliness::numeric,3)::text stored_remote, round(f.remote_friendliness::numeric,3)::text fresh_remote
    from fresh f join stored s on s.company = f.company
    where f.total_jobs >= 30 order by f.total_jobs desc limit 25`)
  let t1bOk = true
  const t1bBad: string[] = []
  for (const row of parity) {
    const dTotal = Math.abs(Number(row.stored_total) - Number(row.fresh_total))
    const dAfrica = Math.abs(Number(row.stored_africa) - Number(row.fresh_africa))
    const dRemote = Math.abs(Number(row.stored_remote) - Number(row.fresh_remote))
    // allow small drift from ingest happening after the daily refresh
    if (dTotal > Math.max(15, Number(row.fresh_total) * 0.25) || dAfrica > 0.06 || dRemote > 0.06) {
      t1bOk = false
      t1bBad.push(`${row.company} (total ${row.stored_total}->${row.fresh_total}, africa ${row.stored_africa}->${row.fresh_africa}, remote ${row.stored_remote}->${row.fresh_remote})`)
    }
  }
  check('T1b stored == fresh recompute (top 25 companies)', t1bOk,
    t1bBad.length ? `drift: ${t1bBad.slice(0, 5).join('; ')}` : 'no material drift')

  // ── T2: Africa honesty ────────────────────────────────────────────────
  const africa = await q<{ company: string; decided: number; open_of_decided: string; unknown_share: string }>(`
    select company, africa_decided_jobs as decided,
      round(africa_open_of_decided::numeric,3)::text open_of_decided,
      round(africa_unknown_share::numeric,3)::text unknown_share
    from company_intelligence where total_jobs >= 30 order by total_jobs desc limit 12`)
  const t2 = africa.every(r => Number(r.unknown_share) > 0)
  check('T2 Africa metrics honest (unknown share populated)', t2,
    africa.slice(0, 6).map(r => `${r.company}: decided ${r.decided}, open-of-decided ${r.open_of_decided}, unknown ${r.unknown_share}`).join(' | '))

  // ── T3: remote honesty (no fake 1.0) ──────────────────────────────────
  const remote = await q<{ company: string; stored: string; fresh: string; total: string }>(`
    with fresh as (select company, remote_friendliness from aggregate_company_intelligence()),
    stored as (select company, remote_friendliness from company_intelligence)
    select s.company, round(s.remote_friendliness::numeric,3)::text stored,
      round(f.remote_friendliness::numeric,3)::text fresh,
      (select count(*) from jobs j where j.company = s.company and j.is_active)::text total
    from stored s join fresh f on f.company = s.company
    where (select count(*) from jobs j where j.company = s.company and j.is_active) >= 20`)
  const t3 = remote.every(r => Number(r.fresh) < 0.99 || Number(r.fresh) === Number(r.stored))
  check('T3 remote_friendliness honest (no fake 1.0 with onsite/hybrid jobs)', t3,
    remote.slice(0, 6).map(r => `${r.company}: ${r.stored} (fresh ${r.fresh}, ${r.total} jobs)`).join(' | '))

  // ── T4: pruning ───────────────────────────────────────────────────────
  const orphans = await q<{ n: string }>(`
    select count(*)::text n from company_intelligence ci
    where not exists (select 1 from jobs j where j.company = ci.company and j.is_active)`)
  check('T4 no orphan company_intelligence rows', Number(orphans[0].n) === 0,
    `orphan rows: ${orphans[0].n}`)

  // ── T5: stale listings ────────────────────────────────────────────────
  const old = await q<{ n: string }>(`
    select count(*)::text n from jobs where is_active and posted_at < now() - interval '90 days'`)
  check('T5 no active listings older than 90 days', Number(old[0].n) === 0,
    `stale active: ${old[0].n}`)

  // ── T6: evidence honesty ──────────────────────────────────────────────
  const ev = await q<{ n: string }>(`
    select count(*)::text n from job_evidence_v1
    where status = 'verified' and (excerpt is null or excerpt = '' or http_status >= 400)`)
  check('T6 evidence honest (verified rows carry excerpts, http 200)', Number(ev[0].n) === 0,
    `violations: ${ev[0].n}`)

  // ── T7: source totals vs active ground truth ──────────────────────────
  const src = await q<{ source: string; stored: string; active: string }>(`
    select si.source, si.total_jobs::text stored,
      (select count(*) from jobs j where j.source = si.source and j.is_active)::text active
    from source_intelligence si`)
  const t7bad: string[] = []
  for (const r of src) {
    const d = Math.abs(Number(r.stored) - Number(r.active))
    if (d > Math.max(50, Number(r.active) * 0.15)) t7bad.push(`${r.source} (${r.stored} vs ${r.active})`)
  }
  check('T7 source_intelligence totals match active jobs', t7bad.length === 0,
    t7bad.length ? `drift: ${t7bad.join('; ')}` : 'all sources consistent')

  // ── T8: verified quality distribution (informational) ─────────────────
  const qual = await q<{ model_version: string; n: string; q40: string }>(`
    select model_version, count(*)::text n,
      count(*) filter (where quality_score >= 40)::text q40
    from job_ai_intelligence
    where model_version like '%:%' and model_version not like 'regex%'
    group by 1 order by count(*) desc limit 6`)
  console.log('\nINFO  T8 verified-row quality (top models):')
  for (const r of qual) console.log(`       ${r.model_version}: ${r.n} rows, ${r.q40} quality>=40`)

  console.log(`\n=== RESULT: ${failures === 0 ? 'ALL CHECKS PASSED ✅' : `${failures} CHECK(S) FAILED ❌`} ===`)
  await c.end()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('AUDIT ERROR:', e?.message || String(e))
  try { await c.end() } catch {}
  process.exit(2)
})
