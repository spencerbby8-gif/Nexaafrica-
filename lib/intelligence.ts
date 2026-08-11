import type { EmploymentType } from '@/lib/types'
import { eligibilityScanText } from '@/lib/geo/eligibility'

/**
 * Nexa Intelligence Extraction Engine (Phase 16)
 * ----------------------------------------------
 * The ONE place job intelligence is extracted from raw text. Runs once at
 * ingestion; the result is persisted to `jobs.intelligence` (a versioned,
 * auditable JSONB signal store) plus the structured salary columns.
 *
 * Core principle:  "Extract and normalize what exists. Never invent what
 * does not."  Every signal is deterministic (regex/rules, no AI), carries a
 * verbatim evidence quote, and abstains when evidence is absent.
 *
 * The store shape is intentionally generic so future AI extractors can write
 * the SAME structure (type + value + confidence + evidence) and remain
 * auditable — no black boxes, no schema churn.
 */

export const INTELLIGENCE_VERSION = 1

export type SignalConfidence = 'high' | 'medium' | 'low'
export type SignalSource = 'posting-text' | 'listing-metadata'

/** A single persisted, evidence-backed signal. */
export interface IntelligenceSignal {
  /** Stable machine type, e.g. 'timezone_requirement', 'eor_provider'. */
  type: string
  /** Normalized value when applicable (provider name, benefit key, tz ref). */
  value: string | null
  confidence: SignalConfidence
  /** Verbatim quote from the posting — the proof. Null for metadata signals. */
  evidence: string | null
  source: SignalSource
}

export interface SalaryIntelligence {
  min: number | null
  max: number | null
  currency: string | null // USD | EUR | GBP | CAD | AUD
  period: string | null // year | month | week | day | hour
  /** The exact text matched, preserved as evidence. */
  raw: string
}

/** The persisted intelligence object stored on `jobs.intelligence`. */
export interface JobIntelligence {
  version: number
  extracted_at: string
  employment_type: EmploymentType
  salary: SalaryIntelligence | null
  signals: IntelligenceSignal[]
}

export interface ExtractionInput {
  title?: string | null
  description?: string | null
  location?: string | null
  tags?: string[] | null
}

/* ------------------------------------------------------------------ */
/* Evidence helper                                                      */
/* ------------------------------------------------------------------ */

/** Trim a match to a readable ~160-char sentence so we can quote the source. */
function excerptAround(text: string, index: number, matchLen: number): string {
  const start = Math.max(
    text.lastIndexOf('.', index),
    text.lastIndexOf('\n', index),
    0,
  )
  let end = text.indexOf('.', index + matchLen)
  if (end === -1) end = Math.min(text.length, index + matchLen + 80)
  let s = text
    .slice(start === 0 ? 0 : start + 1, end + 1)
    .replace(/[#*`_>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > 160) {
    // Word-aligned truncation — evidence strings are user-facing quotes.
    const cut = s.slice(0, 160)
    const sp = cut.lastIndexOf(' ')
    s = `${sp > 100 ? cut.slice(0, sp) : cut}…`
  }
  return s
}

/** Find the first regex match and return its verbatim sentence, or null. */
function quote(text: string, re: RegExp): string | null {
  const m = re.exec(text)
  if (!m) return null
  return excerptAround(text, m.index, m[0].length) || null
}

/* ------------------------------------------------------------------ */
/* Salary extraction (greatly expanded vs. the old range-only regex)    */
/* ------------------------------------------------------------------ */

const CURRENCY_SYMBOL: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
}
const CURRENCY_WORD: Record<string, string> = {
  usd: 'USD',
  us$: 'USD',
  eur: 'EUR',
  gbp: 'GBP',
  cad: 'CAD',
  aud: 'AUD',
}

function normalizeCurrency(tok: string | undefined | null): string | null {
  if (!tok) return null
  const t = tok.trim().toLowerCase()
  if (CURRENCY_SYMBOL[tok.trim()]) return CURRENCY_SYMBOL[tok.trim()]
  return CURRENCY_WORD[t] ?? null
}

/** Parse "120k" / "150,000" / "80.000" / "95000" into an integer amount. */
function parseAmount(raw: string): number | null {
  if (!raw) return null
  let s = raw.trim().toLowerCase().replace(/\s/g, '')
  let mult = 1
  if (s.endsWith('k')) {
    mult = 1000
    s = s.slice(0, -1)
  }
  // Treat , and . as thousands separators (e.g. 150,000 / 80.000).
  s = s.replace(/[,.](?=\d{3}\b)/g, '')
  // Any remaining separators (decimals) — drop the fractional part.
  s = s.replace(/[,.]\d+$/, '')
  if (!/^\d+$/.test(s)) return null
  const n = Number.parseInt(s, 10) * mult
  return Number.isFinite(n) ? n : null
}

const PERIOD_RE =
  /\/?\s*(per\s+|an\s+|a\s+)?(hour|hr|day|week|wk|month|mo|year|yr|annum|annually)\b/i

function normalizePeriod(text: string, fallbackBySize: number | null): string | null {
  const m = PERIOD_RE.exec(text)
  if (m) {
    const p = m[2].toLowerCase()
    if (p === 'hour' || p === 'hr') return 'hour'
    if (p === 'day') return 'day'
    if (p === 'week' || p === 'wk') return 'week'
    if (p === 'month' || p === 'mo') return 'month'
    return 'year' // year | yr | annum | annually
  }
  // No explicit period: infer from magnitude. Large numbers are annual.
  if (fallbackBySize == null) return null
  if (fallbackBySize >= 10000) return 'year'
  return null // small number, no period word — too ambiguous to assert
}

const NUM = String.raw`\d{1,3}(?:[,. ]?\d{3})*(?:k)?|\d+(?:k)?`
const CUR = String.raw`(?:US\$|\$|€|£|USD|EUR|GBP|CAD|AUD)`

// Range: $100k - $150k | €80,000 to €120,000 | USD 80k–100k
const RANGE_RE = new RegExp(
  `(${CUR})\\s?(${NUM})\\s?(?:-|–|—|to)\\s?(${CUR})?\\s?(${NUM})\\s*((?:/|per\\s|a\\s|an\\s)?(?:hour|hr|day|week|wk|month|mo|year|yr|annum|annually))?`,
  'i',
)
// [V2] Trailing-currency range: "135000-165000 USD", "80k–120k EUR" — only
// accepted when a currency word follows, so bare number pairs ("10-15
// employees") can never be misread as salary.
const RANGE_RE_TRAILING = new RegExp(
  `(${NUM})\\s?(?:-|–|—|to)\\s?(${NUM})\\s*((?:/|per\\s|a\\s|an\\s)?(?:hour|hr|day|week|wk|month|mo|year|yr|annum|annually))?\\s*(${CUR})`,
  'i',
)
// Upper bound: up to $200k | earn up to €150,000
const UPTO_RE = new RegExp(
  `up\\s+to\\s+(${CUR})\\s?(${NUM})\\s*((?:/|per\\s|a\\s|an\\s)?(?:hour|hr|day|week|wk|month|mo|year|yr|annum|annually))?`,
  'i',
)
// Single / rate: $120k | $150,000 | $50/hour | $500/day
const SINGLE_RE = new RegExp(
  `(${CUR})\\s?(${NUM})\\s*((?:/|per\\s|a\\s|an\\s)\\s?(?:hour|hr|day|week|wk|month|mo|year|yr|annum|annually))?`,
  'i',
)

/** Magnitude sanity bounds per period — rejects malformed extractions. */
function plausible(amount: number, period: string | null): boolean {
  if (amount <= 0) return false
  switch (period) {
    case 'hour':
      return amount >= 3 && amount <= 5000
    case 'day':
      return amount >= 20 && amount <= 50000
    case 'week':
      return amount >= 100 && amount <= 200000
    case 'month':
      return amount >= 200 && amount <= 1000000
    case 'year':
    case null:
      return amount >= 1000 && amount <= 10000000
    default:
      return false
  }
}

/**
 * Extract structured + raw salary. Conservative: returns null rather than
 * guess. Tries range, then upper-bound, then single value/rate.
 */
export function extractSalary(text: string): SalaryIntelligence | null {
  if (!text) return null

  // 1) Range
  const r = RANGE_RE.exec(text)
  if (r) {
    const currency = normalizeCurrency(r[1]) ?? normalizeCurrency(r[3])
    const min = parseAmount(r[2])
    const max = parseAmount(r[4])
    const period = normalizePeriod(r[0], max ?? min)
    if (currency && min != null && max != null && min <= max && plausible(max, period)) {
      return { min, max, currency, period, raw: r[0].trim() }
    }
  }

  // 1b) Trailing-currency range ("135000-165000 USD")
  const rt = RANGE_RE_TRAILING.exec(text)
  if (rt) {
    const currency = normalizeCurrency(rt[4])
    const min = parseAmount(rt[1])
    const max = parseAmount(rt[2])
    const period = normalizePeriod(rt[3] || '', max ?? min)
    if (currency && min != null && max != null && min <= max && plausible(max, period)) {
      return { min, max, currency, period, raw: rt[0].trim() }
    }
  }

  // 2) Upper bound ("up to X")
  const u = UPTO_RE.exec(text)
  if (u) {
    const currency = normalizeCurrency(u[1])
    const max = parseAmount(u[2])
    const period = normalizePeriod(u[0], max)
    if (currency && max != null && plausible(max, period)) {
      return { min: null, max, currency, period, raw: u[0].trim() }
    }
  }

  // 3) Single value / hourly-daily-weekly rate
  const s = SINGLE_RE.exec(text)
  if (s) {
    const currency = normalizeCurrency(s[1])
    const amount = parseAmount(s[2])
    const hasPeriodWord = !!s[3]
    const period = normalizePeriod(s[0], amount)
    // Require either an explicit period word OR an annual-magnitude number,
    // so we never promote a stray "$5" or version "$3" into a salary.
    if (
      currency &&
      amount != null &&
      (hasPeriodWord || (period === 'year' && amount >= 10000)) &&
      plausible(amount, period)
    ) {
      return { min: amount, max: amount, currency, period, raw: s[0].trim() }
    }
  }

  return null
}

/** Human-readable salary string for display + the salary_range text column. */
export function formatSalary(s: SalaryIntelligence | null): string | null {
  if (!s || s.currency == null) return null
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
  const sym =
    s.currency === 'USD' ? '$' : s.currency === 'EUR' ? '€' : s.currency === 'GBP' ? '£' : ''
  const unit = s.period && s.period !== 'year' ? `/${s.period}` : ''
  const cur = sym || `${s.currency} `
  if (s.min != null && s.max != null && s.min !== s.max) {
    return `${cur}${fmt(s.min)} - ${cur}${fmt(s.max)}${unit}`.trim()
  }
  const single = s.max ?? s.min
  if (single == null) return null
  const prefix = s.min == null ? 'Up to ' : ''
  return `${prefix}${cur}${fmt(single)}${unit}`.trim()
}

/* ------------------------------------------------------------------ */
/* Employment type — explicit, no silent full_time default             */
/* ------------------------------------------------------------------ */

/**
 * Returns an explicit employment type, or 'unknown' when the text gives no
 * trustworthy signal. NEVER assumes full_time. `metaType` is the structured
 * type the ATS adapter already provided (trusted over free-text inference).
 */
export function detectEmploymentType(
  text: string,
  metaType?: string | null,
): EmploymentType {
  const meta = (metaType ?? '').toLowerCase()
  if (meta) {
    if (/full[\s-]?time/.test(meta)) return 'full_time'
    if (/part[\s-]?time/.test(meta)) return 'part_time'
    if (/contract|contractor/.test(meta)) return 'contract'
    if (/freelance/.test(meta)) return 'freelance'
    if (/consultan/.test(meta)) return 'consultant'
    if (/temp/.test(meta)) return 'temporary'
    if (/intern/.test(meta)) return 'internship'
  }
  const t = text.toLowerCase()
  if (/\bintern(ship)?\b/.test(t)) return 'internship'
  if (/\bfreelancer?\b/.test(t)) return 'freelance'
  if (/\bconsultant\b/.test(t)) return 'consultant'
  if (/\b(contract|contractor|independent contractor|1099|b2b contract)\b/.test(t))
    return 'contract'
  if (/\btemporary\b|\btemp\s+(role|position|contract)\b/.test(t)) return 'temporary'
  if (/\bpart[\s-]?time\b/.test(t)) return 'part_time'
  if (/\bfull[\s-]?time\b|\bpermanent\b/.test(t)) return 'full_time'
  return 'unknown'
}

/* ------------------------------------------------------------------ */
/* Signal patterns (single source for ingest + render)                 */
/* ------------------------------------------------------------------ */

const TIMEZONE_RE =
  /((overlap|aligned?|within|work(ing)? hours?).{0,40}(utc|gmt|cet|cest|est|pst|cst|bst|time ?zones?)|time ?zones?.{0,40}(overlap|requirement|between|preferred|based)|[+-]\d ?hours? of|\b(pst|est|cst|cet|gmt|utc)\s+(hours|business hours|time ?zone))/i

/** Pull a specific timezone token for the value field when present. */
const TIMEZONE_TOKEN_RE = /\b(pst|est|cst|cet|cest|gmt|utc|bst)\b/i

const WORK_AUTH_PATTERNS: { value: string; re: RegExp }[] = [
  { value: 'US work authorization', re: /(authoriz(ed|ation) to work in the (us|u\.s\.|usa|united states)|eligible to work in the (us|united states)|us work authoriz)/i },
  { value: 'UK work authorization', re: /(authoriz(ed|ation) to work in the (uk|united kingdom)|right to work in the (uk|united kingdom))/i },
  { value: 'EU work authorization', re: /(authoriz(ed|ation) to work in (the )?(eu|european union)|eligible to work in (the )?(eu|european union))/i },
  { value: 'Security clearance', re: /security clearance/i },
  { value: 'Citizenship requirement', re: /\b(us|u\.s\.|uk|eu)\s+citizen(ship)?\b|must be a citizen/i },
  { value: 'Visa sponsorship not available', re: /(no visa sponsorship|visa sponsorship (is )?(not available|unavailable|not provided))/i },
  { value: 'Work permit requirement', re: /\bwork permit\b/i },
  { value: 'Residency requirement', re: /must (reside|be a resident)|residents? only/i },
]

const WORLDWIDE_RE =
  /(work from anywhere|hire (anywhere|globally)|anywhere in the world|fully remote,? (worldwide|globally)|\bworldwide\b|\bglobal(ly)? remote\b)/i
const EMEA_RE = /\bemea\b/i

/**
 * EOR / global-employment platforms. Conservative per the Phase 15 audit:
 * generic-word brands (Atlas, Plane, Multiplier) require employment context;
 * unambiguous brand forms (remote.com, oyster hr) match directly.
 */
const EOR_PLATFORMS: { name: string; re: RegExp }[] = [
  { name: 'Deel', re: /\bdeel\b/i },
  { name: 'Remote.com', re: /remote\.com/i },
  { name: 'Oyster', re: /\boyster ?hr\b|\bvia oyster\b|\bthrough oyster\b/i },
  { name: 'Multiplier', re: /\bvia multiplier\b|\bthrough multiplier\b|usemultiplier/i },
  { name: 'Atlas', re: /\batlas hxm\b|\bvia atlas\b/i },
  { name: 'Velocity Global', re: /velocity global/i },
  { name: 'Ontop', re: /\bvia ontop\b|getontop/i },
  { name: 'Plane', re: /\bvia plane\b|plane\.com/i },
  { name: 'Payoneer', re: /payoneer/i },
]
const EOR_GENERIC_RE =
  /(employer of record|\beor\b|global payroll|hire (anywhere|globally)|hire in \d+\+? countries|payroll provider)/i

const ASYNC_PATTERNS: { value: string; re: RegExp }[] = [
  { value: 'Async-first', re: /\b(async|asynchronous)([\s-]?(first|culture|communication|work))?\b/i },
  { value: 'Distributed team', re: /\bdistributed team\b/i },
  { value: 'Flexible schedule', re: /\bflexible (schedule|hours|working hours)\b/i },
  { value: 'Timezone flexible', re: /\b(any time ?zone|timezone flexible|work in your own time ?zone|no (set|fixed) hours)\b/i },
]

const BENEFIT_PATTERNS: { value: string; re: RegExp }[] = [
  { value: 'Healthcare', re: /\b(health\s?(insurance|care|coverage)|medical (insurance|coverage)|dental|vision)\b/i },
  { value: 'Equity', re: /\b(equity|stock options?|rsus?|esop)\b/i },
  { value: 'Retirement', re: /\b(401\(?k\)?|retirement (plan|savings)|pension)\b/i },
  { value: 'Learning budget', re: /\b(learning|education|professional development|l&d)\s+(budget|stipend|allowance)\b/i },
  { value: 'Equipment budget', re: /\b(equipment|home office|wfh)\s+(budget|stipend|allowance)\b/i },
  { value: 'Travel stipend', re: /\b(travel|retreat)\s+(stipend|budget|allowance)\b|company retreats?\b/i },
  { value: 'Paid time off', re: /\b(unlimited pto|paid time off|\bpto\b|annual leave|paid vacation)\b/i },
  { value: 'Parental leave', re: /\bparental leave|maternity leave|paternity leave\b/i },
]

/* ------------------------------------------------------------------ */
/* The engine                                                           */
/* ------------------------------------------------------------------ */

/**
 * Extract the full intelligence object from a job's raw fields. Pure,
 * deterministic, no side effects. Used at ingest (persist) and as a render
 * fallback for rows not yet backfilled.
 */
export function extractIntelligence(
  input: ExtractionInput,
  metaEmploymentType?: string | null,
): JobIntelligence {
  const text = input.description ?? ''
  const haystack = `${text} ${input.location ?? ''} ${(input.tags ?? []).join(' ')}`.trim()
  const signals: IntelligenceSignal[] = []

  const push = (
    type: string,
    value: string | null,
    confidence: SignalConfidence,
    re: RegExp,
    source: SignalSource = 'posting-text',
  ) => {
    const evidence = quote(haystack, re)
    if (!evidence) return false
    signals.push({ type, value, confidence, evidence, source })
    return true
  }

  // Timezone requirement
  if (TIMEZONE_RE.test(haystack)) {
    const tz = TIMEZONE_TOKEN_RE.exec(haystack)?.[1]?.toUpperCase() ?? null
    push('timezone_requirement', tz, 'high', TIMEZONE_RE)
  }

  // Work authorization (each distinct restriction kept, deduped by value)
  for (const wa of WORK_AUTH_PATTERNS) {
    if (wa.re.test(haystack)) push('work_authorization', wa.value, 'high', wa.re)
  }

  // Scope — [TRUTH LAYER v1] judged against the dead-zone-stripped
  // eligibility scan view: company marketing ("partners with businesses
  // worldwide") and market-coverage lines can no longer mint a scope signal
  // (proven live: this exact chain fabricated 'likely' verdicts at ingest).
  // Quotes are still taken from the original haystack.
  const scopeScan = eligibilityScanText(haystack)
  if (WORLDWIDE_RE.test(scopeScan)) push('scope_worldwide', null, 'medium', WORLDWIDE_RE)
  else if (EMEA_RE.test(scopeScan)) push('scope_emea', null, 'medium', EMEA_RE)

  // EOR providers — one named provider max, else generic infra.
  let eorFound = false
  for (const p of EOR_PLATFORMS) {
    if (p.re.test(haystack)) {
      eorFound = push('eor_provider', p.name, 'high', p.re)
      if (eorFound) break
    }
  }
  if (!eorFound && EOR_GENERIC_RE.test(haystack)) {
    push('eor_infrastructure', null, 'medium', EOR_GENERIC_RE)
  }

  // Async / work culture
  for (const a of ASYNC_PATTERNS) {
    if (a.re.test(haystack)) push('async_culture', a.value, 'medium', a.re)
  }

  // Benefits
  for (const b of BENEFIT_PATTERNS) {
    if (b.re.test(haystack)) push('benefit', b.value, 'high', b.re)
  }

  // Salary
  const salary = extractSalary(haystack)
  if (salary) {
    signals.push({
      type: 'salary_disclosed',
      value: formatSalary(salary),
      confidence: 'high',
      evidence: salary.raw,
      source: 'posting-text',
    })
  }

  const employment_type = detectEmploymentType(text, metaEmploymentType)

  return {
    version: INTELLIGENCE_VERSION,
    extracted_at: new Date().toISOString(),
    employment_type,
    salary,
    signals,
  }
}

/** Type guard: is a persisted intelligence object present and current? */
export function isCurrentIntelligence(
  intel: unknown,
): intel is JobIntelligence {
  return (
    !!intel &&
    typeof intel === 'object' &&
    (intel as JobIntelligence).version === INTELLIGENCE_VERSION &&
    Array.isArray((intel as JobIntelligence).signals)
  )
}
