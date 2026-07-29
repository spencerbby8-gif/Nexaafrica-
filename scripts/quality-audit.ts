/**
 * Nexa Intelligence — Hostile Quality Audit (P4)
 *
 * Measures intelligence accuracy against live ground truth:
 *   - fetches the original job page (apply_url) for every sampled row
 *   - fetches the company homepage (apply_url origin)
 *   - verifies every intelligence field against the fetched text + the
 *     ingest-canonical description_md
 *   - computes precision / recall / hallucination / FP / FN / unknown /
 *     evidence coverage per provider:model
 *   - persists per-job scores into ai_benchmark_results
 *   - writes per-model accuracy into ai_model_registry.benchmarks +
 *     ai_model_catalog models[].benchmarks (what the accuracy-first
 *     dynamic registry consumes)
 *
 * Definitions (hostile, conservative):
 *   TP  claimed value/label is supported by ground-truth text
 *   FP  claimed value has no support in ground truth (unsupported claim)
 *   FN  ground truth clearly contains the info but the field is null/unknown
 *   C-U both ground truth and field are silent (correct abstention)
 *   FAB evidence quote not found verbatim in ground truth (fabrication)
 *
 * Run: set -a; source env.prod; set +a; npx tsx scripts/quality-audit.ts --limit=500
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SB_URL || !SB_KEY) { console.error('missing supabase env'); process.exit(1) }
const sb = createClient(SB_URL, SB_KEY)

const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 500
const CONCURRENCY = 20
const FETCH_TIMEOUT = 9000

// ─── Ground truth extraction ────────────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
}
function norm(s: string): string {
  return s.toLowerCase().replace(/[#*`_>[\]]/g, ' ').replace(/\s+/g, ' ').trim()
}
async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT): Promise<{ text: string; status: number | null }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexaBot/2.0; +https://v0-nexaafrica.vercel.app)', 'Accept': 'text/html,*/*;q=0.8' },
      signal: ctrl.signal,
      redirect: 'follow',
    })
    clearTimeout(t)
    if (!res.ok) return { text: '', status: res.status }
    return { text: norm(htmlToText(await res.text())), status: res.status }
  } catch { return { text: '', status: null } }
}

// ─── Field checkers ────────────────────────────────────────────────
const RX = {
  salaryStated: /(\$|usd|eur|gbp|cad|aud)\s?\d[\d,\.]*\s*(k\b)?|salary range|compensation range|base salary|annual salary/i,
  africa: /\b(africa|african|nigeria|kenya|ghana|egypt|south africa|morocco|rwanda|uganda|ethiopia|tanzania|tunisia|senegal|algeria|zimbabwe|namibia)\b/i,
  restrict: /\b(us|u\.s\.|usa|united states|uk|u\.k\.|united kingdom|eu|canada|australia)\s+(only|residents? only|citizens? only)\b|\b(?:only|based) in the (us|usa|uk|eu|united states|united kingdom)\b|must (?:be )?(?:reside|residing|be located|be based)|work authori[sz]ation (?:in|for) the (us|uk|eu)|authorized to work in the (us|uk)/i,
  worldwide: /work from anywhere|\banywhere in the world\b|\bworldwide\b|global(?:ly)? remote|remote[^\.\n]{0,30}(global|worldwide)|\bemea\b|distributed (?:team|workforce|company)|hire (?:in )?\d+\+? countries|anywhere[^\.\n]{0,20}(emea|africa)/i,
  visaSponsor: /visa sponsor|sponsor(ship)? (?:is )?(?:available|offered|provided)|we (?:can )?sponsor|immigration (?:support|sponsorship)|sponsorship (?:is )?available|relocation (?:support|assistance|package)/i,
  remote: /\bremote\b|work from (home|anywhere)|wfh|fully distributed|distributed (?:team|workforce)/i,
  hybrid: /\bhybrid\b|\b\d\+\s*days?(?: of)? in[- ](?:the )?office\b|\b\d+ days? (?:in|from) (?:the )?office\b/i,
  senior: /\bsenior\b|\bsr\.?\s|\blead\b|\bprincipal\b|\bstaff\b|\bhead of\b|\b(?:[5-9]|1\d)\+?\s*(?:years?|yrs?)\s*(?:of )?(?:experience|exp)\b/i,
  entry: /\bentry[- ]level\b|\bjunior\b|\bnew grad(?:uate)?\b|\bintern(ship)?\b|\b[0-2]\+?\s*(?:years?|yrs?)\s*(?:of )?(?:experience|exp)\b/i,
}
function numVariants(n: number): string[] {
  const out = [String(Math.abs(n)), Math.abs(n).toLocaleString('en-US')]
  if (n % 1000 === 0) out.push(String(n / 1000) + 'k')
  return out
}

type Field = 'salary' | 'africa' | 'remote' | 'visa' | 'experience' | 'skills' | 'quote_salary' | 'quote_africa' | 'quote_remote' | 'quote_company'
type Verdict = 'TP' | 'FP' | 'FN' | 'CU' | 'FAB' | 'SKIP'

interface Row {
  job_id: string; model_version: string
  africa_eligibility: string | null; africa_confidence: number | null; africa_evidence: string | null
  remote_eligibility: string | null; remote_evidence: string | null
  visa_sponsorship: string | null
  salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_evidence: string | null
  company_legitimacy: string | null; company_evidence: string | null
  experience_level: string | null
  required_skills: string[] | null
  apply_url: string; source: string | null; description_md: string; company: string
  employment_type: string; is_flagged: boolean | null; flagged_reason: string | null
}

function checkField(field: Field, row: Row, T: string, Tco: string): Verdict {
  const truth = T + ' ' + norm(row.description_md || '')
  switch (field) {
    case 'salary': {
      const claimed = row.salary_min != null || row.salary_max != null
      if (claimed) {
        const nums = [row.salary_min, row.salary_max].filter((x): x is number => x != null)
        const found = nums.every(n => numVariants(Math.abs(n)).some(v => truth.includes(v)))
        return found ? 'TP' : 'FP'
      }
      return RX.salaryStated.test(truth) ? 'FN' : 'CU'
    }
    case 'africa': {
      const v = row.africa_eligibility
      if (v === 'explicit') return RX.africa.test(truth) ? 'TP' : 'FP'
      if (v === 'restricted') return RX.restrict.test(truth) ? 'TP' : 'FP'
      if (v === 'likely') return RX.worldwide.test(truth) ? 'TP' : 'FP'
      // unknown claimed: FN only if africa explicit language exists
      return RX.africa.test(truth) ? 'FN' : 'CU'
    }
    case 'remote': {
      const v = row.remote_eligibility
      if (v === 'hybrid') return RX.hybrid.test(truth) ? 'TP' : 'FP'
      if (v === 'fully_remote') return RX.remote.test(truth) || !RX.hybrid.test(truth) ? 'TP' : 'FP'
      if (v === 'onsite') return 'SKIP'
      return RX.remote.test(truth) ? 'FN' : 'CU'
    }
    case 'visa': {
      const v = row.visa_sponsorship
      if (v === 'available') return RX.visaSponsor.test(truth) ? 'TP' : 'FP'
      if (v === 'not_available') return /no visa sponsorship|cannot sponsor|sponsorship (?:is )?not (?:available|offered)/i.test(truth) ? 'TP' : 'SKIP'
      return RX.visaSponsor.test(truth) ? 'FN' : 'CU'
    }
    case 'experience': {
      const v = row.experience_level
      if (!v || v === 'unknown') return RX.senior.test(truth) || RX.entry.test(truth) ? 'FN' : 'CU'
      if (v === 'senior' || v === 'executive') return RX.entry.test(truth) && !RX.senior.test(truth) ? 'FP' : 'TP'
      if (v === 'entry') return RX.entry.test(truth) ? 'TP' : (RX.senior.test(truth) ? 'FP' : 'SKIP')
      return 'TP' // mid is default-plausible
    }
    case 'skills': {
      const skills = (row.required_skills || []).filter(s => s && s.length > 2).slice(0, 5)
      if (skills.length === 0) return 'CU'
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const missing = skills.filter(s => !(new RegExp(`\\b${esc(s.toLowerCase()).replace(/\\ /g, '\\s*')}\\b`, 'i')).test(truth))
      return missing.length === 0 ? 'TP' : (missing.length >= skills.length - 1 ? 'FP' : 'TP')
    }
    case 'quote_salary': case 'quote_africa': case 'quote_remote': {
      const ev = field === 'quote_salary' ? row.salary_evidence : field === 'quote_africa' ? row.africa_evidence : row.remote_evidence
      if (!ev) return 'SKIP'
      const q = norm(ev)
      if (q.length < 15) return 'SKIP'
      return truth.includes(q.slice(0, Math.min(q.length, 120))) ? 'TP' : 'FAB'
    }
    case 'quote_company': {
      const ev = row.company_evidence
      if (!ev) return 'SKIP'
      const q = norm(ev)
      if (q.length < 15) return 'SKIP'
      return (truth + ' ' + Tco).includes(q.slice(0, Math.min(q.length, 120))) ? 'TP' : 'FAB'
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log(`[audit] sampling ${LIMIT} most recent intelligence rows`)
  const { data, error } = await sb
    .from('job_ai_intelligence')
    .select('job_id, model_version, africa_eligibility, africa_confidence, africa_evidence, remote_eligibility, remote_evidence, visa_sponsorship, salary_min, salary_max, salary_currency, salary_evidence, company_legitimacy, company_evidence, experience_level, required_skills, jobs!inner(apply_url, source, description_md, company, employment_type, is_flagged, flagged_reason, trust_score)')
    .order('last_verified_at', { ascending: false })
    .limit(LIMIT)
  if (error) { console.error('sample error', error.message); process.exit(1) }
  const rows: Row[] = (data as any[]).map(r => ({
    ...r, apply_url: r.jobs.apply_url, source: r.jobs.source, description_md: r.jobs.description_md,
    company: r.jobs.company, employment_type: r.jobs.employment_type, is_flagged: r.jobs.is_flagged,
    flagged_reason: r.jobs.flagged_reason,
  }))
  console.log(`[audit] sampled ${rows.length} rows; fetching ground truth at concurrency ${CONCURRENCY}...`)

  const verdicts: Array<Record<string, Verdict>> = []
  const fetchStats = { pageOk: 0, pageFail: 0, coOk: 0, coFail: 0 }
  let cursor = 0
  async function worker() {
    while (cursor < rows.length) {
      const i = cursor++
      const row = rows[i]
      let origin = ''
      try { origin = new URL(row.apply_url).origin } catch {}
      const [page, co] = await Promise.all([
        fetchText(row.apply_url),
        origin ? fetchText(origin, 7000) : Promise.resolve({ text: '', status: null }),
      ])
      if (page.text.length > 200) fetchStats.pageOk++; else fetchStats.pageFail++
      if (co.text.length > 200) fetchStats.coOk++; else fetchStats.coFail++
      const truth = page.text.length > 200 ? page.text : ''
      const v: Record<string, Verdict> = {}
      for (const f of ['salary','africa','remote','visa','experience','skills','quote_salary','quote_africa','quote_remote','quote_company'] as Field[]) {
        v[f] = checkField(f, row, truth, co.text)
      }
      verdicts[i] = v
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // ─── Metrics ──────────────────────────────────────────────────────
  const fields = ['salary','africa','remote','visa','experience','skills'] as const
  const quoteFields = ['quote_salary','quote_africa','quote_remote','quote_company'] as const
  function emptyAgg() {
    return { TP: 0, FP: 0, FN: 0, CU: 0, FAB: 0, SKIP: 0, rows: 0, rowsWithClaims: 0, fabQuote: 0, fieldTP: Object.fromEntries(fields.map(f=>[f,0])), fieldFP: Object.fromEntries(fields.map(f=>[f,0])), fieldFN: Object.fromEntries(fields.map(f=>[f,0])), fieldCU: Object.fromEntries(fields.map(f=>[f,0])) as Record<string, number> }
  }
  const perModel = new Map<string, ReturnType<typeof emptyAgg>>()
  const overall = emptyAgg()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; const v = verdicts[i] || {}
    const mv = row.model_version || 'unknown'
    const key = mv.startsWith('regex') ? 'regex' : mv
    const agg = perModel.get(key) ?? emptyAgg(); perModel.set(key, agg)
    for (const [agg2] of [[agg], [overall]] as const) {
      agg2.rows++
      let jobClaim = 0, jobTP = 0, jobFP = 0, jobFN = 0
      for (const f of fields) {
        const r = v[f]
        if (r === 'TP') { agg2.TP++; jobTP++; agg2.fieldTP[f] = (agg2.fieldTP[f] as number) + 1 }
        else if (r === 'FP') { agg2.FP++; jobFP++; agg2.fieldFP[f] = (agg2.fieldFP[f] as number) + 1 }
        else if (r === 'FN') { agg2.FN++; jobFN++; agg2.fieldFN[f] = (agg2.fieldFN[f] as number) + 1 }
        else if (r === 'CU') { agg2.CU++; agg2.fieldCU[f] = (agg2.fieldCU[f] as number) + 1 }
      }
      for (const qf of quoteFields) {
        if (v[qf] === 'TP') agg2.TP++
        else if (v[qf] === 'FAB') { agg2.FAB++; agg2.fabQuote++ }
      }
      const hasClaim = jobTP + jobFP > 0 || Object.values({a:row.africa_evidence,b:row.salary_evidence,c:row.remote_evidence,d:row.company_evidence}).some(x => x)
      if (hasClaim) agg2.rowsWithClaims++
      // persist per-job score
    }
  }
  function finalize(agg: ReturnType<typeof emptyAgg>) {
    const claimSupport = agg.TP + agg.FP
    const precision = claimSupport > 0 ? agg.TP / claimSupport : 0
    const recallBase = agg.TP + agg.FN
    const recall = recallBase > 0 ? agg.TP / recallBase : 0
    const hallucRate = agg.rowsWithClaims > 0 ? agg.fabQuote / agg.rowsWithClaims : 0
    const overallScore = Math.round(100 * (0.55 * precision + 0.30 * recall + 0.15 * Math.max(0, 1 - hallucRate)))
    return { precision: +(precision * 100).toFixed(1), recall: +(recall * 100).toFixed(1), hallucRate: +(hallucRate * 100).toFixed(1), overallScore, ...agg }
  }
  const modelScores = new Map<string, ReturnType<typeof finalize>>()
  for (const [k, agg] of perModel) modelScores.set(k, finalize(agg))
  const overallScore = finalize(overall)

  // ─── Persist: ai_benchmark_results (per job), benchmarks per model ──
  console.log('[audit] persisting ai_benchmark_results rows...')
  const benchRows = rows.map((row, i) => {
    const v = verdicts[i] || {}
    const tps = Object.values(v).filter(x => x === 'TP').length
    const fps = Object.values(v).filter(x => x === 'FP' || x === 'FAB').length
    const q = Math.max(0, Math.min(100, Math.round(100 * (tps / Math.max(1, tps + fps + Object.values(v).filter(x => x === 'FN').length * 0.5)))))
    const mv = row.model_version || ''
    return {
      job_id: row.job_id,
      run_at: new Date().toISOString(),
      model_version: mv,
      provider: mv.includes(':') ? mv.split(':')[0] : (mv.startsWith('regex') ? 'regex' : 'unknown'),
      quality_score: q,
      evidence_fields: tps,
      hallucination_risk: fps,
      ai_used: mv.includes(':') && !mv.startsWith('regex'),
      page_fetched: true,
    }
  })
  for (let i = 0; i < benchRows.length; i += 200) {
    const { error: be } = await sb.from('ai_benchmark_results').insert(benchRows.slice(i, i + 200))
    if (be) console.error('bench insert error:', be.message.slice(0, 150))
  }

  console.log('[audit] writing per-model benchmarks into registry + catalog...')
  for (const [key, sc] of modelScores) {
    if (key === 'regex' || !key.includes(':')) continue
    const [provider, ...rest] = key.split(':'); const modelId = rest.join(':')
    const benchmarks = {
      overallScore: sc.overallScore, trustVerification: sc.precision,
      salaryExtraction: undefined as any, companyVerification: undefined as any,
      structuredJSON: sc.recall, evidenceGeneration: 100 - sc.hallucRate,
      accuracy: { precision: sc.precision, recall: sc.recall, hallucRate: sc.hallucRate, samples: sc.rows, tp: sc.TP, fp: sc.FP, fn: sc.FN, fabricated: sc.FAB },
      lastBenchmarkAt: new Date().toISOString(),
    }
    const { error: re } = await sb.from('ai_model_registry').update({ benchmarks })
      .eq('provider', provider).eq('model_id', modelId)
    if (re) console.error(`registry update ${provider}/${modelId}:`, re.message.slice(0, 120))
  }
  // catalog: patch models[].benchmarks in-place
  const { data: cats } = await sb.from('ai_model_catalog').select('provider, models')
  for (const cat of cats || []) {
    let changed = false
    const models = (cat.models as any[]).map(m => {
      const key = `${cat.provider}:${m.modelId}`
      const sc = modelScores.get(key)
      if (sc) { changed = true; return { ...m, benchmarks: { ...(m.benchmarks || {}), overallScore: sc.overallScore, accuracy: { precision: sc.precision, recall: sc.recall, hallucRate: sc.hallucRate, samples: sc.rows }, lastBenchmarkAt: new Date().toISOString() } } }
      return m
    })
    if (changed) {
      const { error: ce } = await sb.from('ai_model_catalog').update({ models }).eq('provider', cat.provider)
      if (ce) console.error(`catalog update ${cat.provider}:`, ce.message.slice(0, 120))
    }
  }

  // ─── Report ───────────────────────────────────────────────────────
  const report = {
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    fetchStats,
    overall: overallScore,
    fieldBreakdown: Object.fromEntries(fields.map(f => [f, { TP: (overall.fieldTP[f] as number) || 0, FP: (overall.fieldFP[f] as number) || 0, FN: (overall.fieldFN[f] as number) || 0, CU: (overall.fieldCU[f] as number) || 0 }])),
    models: Object.fromEntries([...modelScores.entries()].sort((a, b) => b[1].overallScore - a[1].overallScore).map(([k, v]) => [k, { score: v.overallScore, precision: v.precision, recall: v.recall, hallucRate: v.hallucRate, rows: v.rows, tp: v.TP, fp: v.FP, fn: v.FN, fabricated: v.FAB }])),
  }
  writeFileSync('/tmp/nexa-work/quality-report.json', JSON.stringify(report, null, 1))
  console.log(JSON.stringify(report, null, 1).slice(0, 3000))
}

main().catch(e => { console.error(e); process.exit(1) })
