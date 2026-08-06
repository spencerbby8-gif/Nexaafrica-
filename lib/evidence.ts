import type { Job } from '@/lib/types'
import {
  isCurrentIntelligence,
  type IntelligenceSignal,
} from '@/lib/intelligence'
import { renderEligibility } from '@/lib/geo/render-eligibility'

/**
 * Job Evidence Layer V1
 * ---------------------
 * Derives explainable, evidence-backed signals from data Nexa ALREADY has:
 * the eligibility classification (Phase 14), listing metadata, and the
 * posting's own text. Every signal carries:
 *
 *   - a stable machine `id` (future layers — accessibility scores, readiness
 *     scores, company intelligence — can key off these without re-parsing)
 *   - a `reason`: plain-language WHY the signal is shown (trust-first)
 *   - an optional verbatim `excerpt` from the posting when text-derived,
 *     so users can see the actual evidence, not a black-box verdict
 *
 * Design rules (Phase 15):
 *   - No arbitrary scores. No estimated values. No AI-generated text.
 *   - A signal is emitted ONLY when supported by data; absence of evidence
 *     produces either a neutral "not stated" signal or nothing at all.
 *   - Derivation is pure + synchronous: no DB writes, no new tables, no
 *     duplicate systems. The single source of truth stays the jobs row.
 */

export type EvidenceTone = 'positive' | 'caution' | 'neutral'

export type EvidenceSource =
  | 'classification' // Phase 14 eligibility tier (itself text-derived, audited)
  | 'posting-text' // matched verbatim in the job description
  | 'listing-metadata' // structured fields from the company's official feed
  | 'ingestion' // Nexa's pipeline checks (active status, posting date)

export interface EvidenceSignal {
  /** Stable machine id — future intelligence layers key off these. */
  id: string
  tone: EvidenceTone
  /** Short badge-style label. */
  label: string
  /** Plain-language explanation of WHY this signal is shown. */
  reason: string
  /** Verbatim snippet from the posting when the signal is text-derived. */
  excerpt?: string
  source: EvidenceSource
}

/* ------------------------------------------------------------------ */
/* Text evidence helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * [EVIDENCE V1.2] Rendering-plain text of a posting. Quotes are extracted
 * from — and verified against — the text users actually read: markdown links
 * collapse to their label (the href is not prose), images vanish, escapes and
 * structural characters are removed, whitespace collapses. The old extractor
 * sliced raw markdown and produced live-reported mangled "quotes" on every
 * page: `"app) Worldwide"`, `"Hostaway(https://himalayas."`, `"…401(K) pl"`,
 * `"…United Stat"` — mid-URL starts and mid-word truncations. That class is
 * eliminated here structurally, not case-by-case.
 */
export function plainifyPosting(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1') // [label](url) -> label (href is not prose)
    .replace(/https?:\/\/\S+/g, ' ') // bare URLs are not quotable prose
    .replace(/\\([\\`*_[\]{}()#+\-.!><])/g, '$1') // markdown escapes (\*\* -> **)
    .replace(/[#*`_>]/g, ' ') // structural characters
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize for quote-traceability comparison (NOT for display). */
function normalizeForMatch(s: string): string {
  return plainifyPosting(s)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * [EVIDENCE V1.2] Quote traceability guard. A quote may render ONLY when it
 * is verifiably present, word-aligned, in the plain rendering of the source
 * text. Stored quotes that are markdown fragments ("app/companies/micro1)
 * provides…"), mid-word truncations ("…United Stat", "pl…"), or simply absent
 * (the mali FP quote) fail this test and are dropped — the signal remains
 * with its honest prose reason, the fabricated-looking quote does not.
 */
export function traceableQuote(quote: string | null | undefined, sourcePlainText: string): string | null {
  if (!quote) return null
  const cleaned = plainifyPosting(quote)
  if (cleaned.length < 12) return null
  const hay = normalizeForMatch(sourcePlainText)
  const needle = normalizeForMatch(cleaned)
  if (!needle || needle.length < 12) return null
  const idx = hay.indexOf(needle)
  if (idx === -1) return null
  const before = idx === 0 ? '' : hay[idx - 1]
  const after = idx + needle.length >= hay.length ? '' : hay[idx + needle.length]
  if (before && WORD_CHAR.test(before)) return null // starts mid-word
  if (after && WORD_CHAR.test(after)) return null // ends mid-word
  return cleaned
}

/**
 * Extract the sentence (trimmed at a word boundary to ~160 chars) containing
 * the first match of `re` in ALREADY-PLAIN text. Word-aligned by
 * construction; returns undefined rather than emitting a fragment.
 */
function extractExcerpt(plain: string, re: RegExp): string | undefined {
  const m = re.exec(plain)
  if (!m) return undefined
  const idx = m.index
  // Expand to sentence boundaries around the match.
  let start = 0
  for (let i = idx - 1; i >= 0; i--) {
    const ch = plain[i]
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') { start = i + 1; break }
  }
  let end = plain.length
  for (let i = idx + m[0].length; i < plain.length; i++) {
    const ch = plain[i]
    if (ch === '.' || ch === '!' || ch === '?') { end = i + 1; break }
  }
  let sentence = plain.slice(start, end).trim()
  // Word-align: never begin or end inside a word.
  if (start > 0 && WORD_CHAR.test(plain[start - 1]) && WORD_CHAR.test(sentence[0] ?? '')) {
    const sp = sentence.search(/\s/)
    if (sp === -1) return undefined
    sentence = sentence.slice(sp + 1)
  }
  if (sentence.length > 160) {
    let cut = sentence.slice(0, 157)
    const lastSpace = cut.lastIndexOf(' ')
    if (lastSpace > 60) cut = cut.slice(0, lastSpace)
    sentence = `${cut.replace(/[\s,;:–—-]+$/, '')}…`
  }
  return sentence.length >= 12 ? sentence : undefined
}

/** Timezone-requirement language (same family used by the Phase 14 audit). */
const TIMEZONE_RE =
  /((overlap|aligned?|within|work(ing)? hours?).{0,40}(utc|gmt|cet|cest|est|pst|bst|time ?zones?)|time ?zones?.{0,40}(overlap|requirement|between|preferred|based)|[+-]\d ?hours? of)/i

/** Work-authorization / visa / clearance language. */
const WORK_AUTH_RE =
  /(authoriz(ed|ation) to work|eligible to work in|right to work in|visa sponsorship|security clearance|work permit)/i

/** Geographic restriction language (mirrors the Phase 14 classifier family). */
const GEO_RESTRICT_RE =
  /((us|uk|eu|canada|united states|north america) ?(based|residents?)? ?only|must (reside|be based|be located) in|residents? only|no visa sponsorship|visa sponsorship (is )?(not available|unavailable))/i

/** Worldwide / anywhere hiring language. */
const WORLDWIDE_RE =
  /(work from anywhere|hire (anywhere|globally)|anywhere in the world|fully remote,? (worldwide|globally)|\bworldwide\b|\bglobal(ly)? remote\b)/i

/** EMEA scope — meaningful for Africa (the A in EMEA). */
const EMEA_RE = /\bemea\b/i

/**
 * EOR / global-employment platforms — DELIBERATELY conservative patterns.
 * The Phase 15 audit proved naive matching produces false positives (144
 * active jobs say "productivity multiplier"; zero meant the EOR company).
 * Each pattern requires either the unambiguous brand form (remote.com,
 * oyster hr) or an employment context within a few words. Generic-word
 * brands (Atlas, Plane, Multiplier) only match with explicit context.
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

/** Generic global-payroll / EOR infrastructure language. */
const EOR_GENERIC_RE =
  /(employer of record|\beor\b|global payroll|hire (anywhere|globally)|hire in \d+\+? countries)/i

/* ------------------------------------------------------------------ */
/* Derivation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Phase 16: surface async-culture and benefits signals from the PERSISTED
 * intelligence store. These were extracted once at ingestion (evidence-backed,
 * versioned) rather than re-parsed here — keeping the render path cheap and the
 * evidence auditable. Eligibility/scope/EOR/timezone are still derived inline
 * below so rows ingested before Phase 16 (empty `intelligence`) keep working;
 * those overlap signals are de-duplicated by id in the panel.
 */
function fromPersistedIntelligence(job: Job, plain: string): EvidenceSignal[] {
  if (!isCurrentIntelligence(job.intelligence)) return []
  const out: EvidenceSignal[] = []
  const seenAsync = new Set<string>()
  const seenBenefit = new Set<string>()

  for (const sig of job.intelligence.signals as IntelligenceSignal[]) {
    // [V1.2] Persisted excerpts render only when traceable word-aligned to
    // the current posting text. Untraceable fragments (live: markdown href
    // slices stored as benefit "quotes") are dropped, not shown.
    const excerpt = traceableQuote(sig.evidence ?? null, plain) ?? undefined
    if (sig.type === 'async_culture' && sig.value && !seenAsync.has(sig.value)) {
      seenAsync.add(sig.value)
      out.push({
        id: `async-${sig.value.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        tone: 'positive',
        label: sig.value,
        reason:
          'The posting describes asynchronous or flexible working culture, which typically eases collaboration across timezones.',
        excerpt,
        source: 'posting-text',
      })
    }
    if (sig.type === 'benefit' && sig.value && !seenBenefit.has(sig.value)) {
      seenBenefit.add(sig.value)
      out.push({
        id: `benefit-${sig.value.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        tone: 'neutral',
        label: sig.value,
        reason: `The posting lists ${sig.value.toLowerCase()} as a benefit.`,
        excerpt,
        source: 'posting-text',
      })
    }
  }
  return out
}

export function deriveEvidence(job: Job, storedAITier?: string | null): EvidenceSignal[] {
  const signals: EvidenceSignal[] = []
  const text = job.description_md ?? ''
  // [V1.2] All matching and all quoting run on the plain rendering — the
  // same words the user reads; markdown hrefs and escapes cannot leak into
  // a "verbatim" quote again.
  const haystack = plainifyPosting(`${text}\n${job.location ?? ''}`)

  /* -- Eligibility (the arbitration plane — the anchor signal) -------- */
  // [V1.2] The anchor tier is the corpus-verified render tier, NOT the raw
  // stored tier: a stale stored verdict can no longer contradict the chip,
  // the hub, and this panel on the same page over the same posting text.
  const eligibility = renderEligibility(job, storedAITier)
  if (eligibility.tier === 'explicit') {
    signals.push({
      id: 'eligibility-explicit',
      tone: 'positive',
      label: 'Explicitly open to Africa',
      reason:
        'The posting names Africa or an African country as an eligible applicant location.',
      excerpt: eligibility.quote ?? undefined,
      source: 'classification',
    })
  } else if (eligibility.tier === 'likely') {
    signals.push({
      id: 'eligibility-likely',
      tone: eligibility.corroborated ? 'positive' : 'neutral',
      label: eligibility.corroborated ? 'Likely open' : 'Likely open · unverified',
      reason: eligibility.corroborated
        ? 'Advertised as globally remote with no geographic restriction detected. Africa is not named, so this is an informed read — not a guarantee.'
        : 'A stored read suggests global hiring, but the current posting text does not confirm it. Awaiting verification — not a guarantee.',
      source: 'classification',
    })
    signals.push({
      id: 'no-geo-restrictions',
      tone: 'positive',
      label: 'No geographic restrictions detected',
      reason:
        'Nexa scanned the posting for region, residency, and work-authorization restrictions and found none.',
      source: 'posting-text',
    })
  } else if (eligibility.tier === 'restricted') {
    signals.push({
      id: 'geo-restrictions',
      tone: 'caution',
      label: 'Geographic restrictions detected',
      reason:
        'The posting contains location, residency, or authorization requirements that may exclude applicants in Africa.',
      excerpt:
        extractExcerpt(haystack, GEO_RESTRICT_RE) ??
        extractExcerpt(haystack, WORK_AUTH_RE),
      source: 'posting-text',
    })
  } else {
    signals.push({
      id: 'eligibility-unknown',
      tone: 'neutral',
      label: 'Eligibility not stated',
      reason:
        'The posting does not state where applicants must be located. Confirm eligibility with the company before investing time.',
      source: 'classification',
    })
  }

  /* -- Scope: worldwide / EMEA -------------------------------------- */
  if (eligibility.tier !== 'restricted') {
    if (WORLDWIDE_RE.test(haystack)) {
      signals.push({
        id: 'scope-worldwide',
        tone: 'positive',
        label: 'Worldwide opportunity',
        reason: 'The posting uses worldwide or work-from-anywhere hiring language.',
        excerpt: extractExcerpt(haystack, WORLDWIDE_RE),
        source: 'posting-text',
      })
    } else if (EMEA_RE.test(haystack)) {
      signals.push({
        id: 'scope-emea',
        tone: 'positive',
        label: 'EMEA opportunity',
        reason:
          'The posting targets the EMEA region, which includes Africa.',
        excerpt: extractExcerpt(haystack, EMEA_RE),
        source: 'posting-text',
      })
    }
  }

  /* -- Remote -------------------------------------------------------- */
  if (job.is_remote) {
    signals.push({
      id: 'remote',
      tone: 'positive',
      label: 'Remote role',
      reason: "Listed as remote in the company's official job feed.",
      source: 'listing-metadata',
    })
  }

  /* -- Contractor ---------------------------------------------------- */
  if (job.employment_type === 'contract') {
    signals.push({
      id: 'contractor',
      tone: 'neutral',
      label: 'Contractor role',
      reason:
        'Listed as a contract position. Contract roles often avoid local-entity employment constraints, which can make cross-border hiring simpler.',
      source: 'listing-metadata',
    })
  }

  /* -- Cautions from posting text ------------------------------------ */
  const tzExcerpt = extractExcerpt(haystack, TIMEZONE_RE)
  if (tzExcerpt) {
    signals.push({
      id: 'timezone-requirement',
      tone: 'caution',
      label: 'Timezone requirement detected',
      reason:
        'The posting mentions specific working-hour or timezone-overlap expectations. Check they are workable from your location.',
      excerpt: tzExcerpt,
      source: 'posting-text',
    })
  }

  if (eligibility.tier !== 'restricted') {
    const authExcerpt = extractExcerpt(haystack, WORK_AUTH_RE)
    if (authExcerpt) {
      signals.push({
        id: 'work-auth-requirement',
        tone: 'caution',
        label: 'Work authorization mention detected',
        reason:
          'The posting references work authorization, visas, or permits. Read the requirement carefully before applying.',
        excerpt: authExcerpt,
        source: 'posting-text',
      })
    }
  }

  /* -- Salary -------------------------------------------------------- */
  if (job.salary_range) {
    signals.push({
      id: 'salary-disclosed',
      tone: 'positive',
      label: 'Salary disclosed',
      reason: `The company published compensation for this role: ${job.salary_range}.`,
      source: 'listing-metadata',
    })
  } else {
    signals.push({
      id: 'salary-undisclosed',
      tone: 'caution',
      label: 'Salary not disclosed',
      reason:
        'No compensation is published in the official listing. Nexa never estimates pay — ask early in the process.',
      source: 'listing-metadata',
    })
  }

  /* -- EOR / global employment infrastructure ------------------------ */
  for (const platform of EOR_PLATFORMS) {
    if (platform.re.test(haystack)) {
      signals.push({
        id: `eor-${platform.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        tone: 'positive',
        label: `${platform.name} detected`,
        reason: `The posting mentions ${platform.name}, a global employment platform — a strong signal the company can legally hire across borders.`,
        excerpt: extractExcerpt(haystack, platform.re),
        source: 'posting-text',
      })
      break // one platform signal is enough; avoid badge spam
    }
  }
  if (
    !signals.some((s) => s.id.startsWith('eor-')) &&
    EOR_GENERIC_RE.test(haystack)
  ) {
    signals.push({
      id: 'eor-generic',
      tone: 'positive',
      label: 'Global hiring infrastructure mentioned',
      reason:
        'The posting references employer-of-record, global payroll, or hire-anywhere capability — signals the company is set up for international employment.',
      excerpt: extractExcerpt(haystack, EOR_GENERIC_RE),
      source: 'posting-text',
    })
  }

  /* -- Async culture + benefits (from persisted Phase 16 store) ------ */
  const seen = new Set(signals.map((s) => s.id))
  for (const s of fromPersistedIntelligence(job, haystack)) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      signals.push(s)
    }
  }

  /* -- Freshness / verification -------------------------------------- */
  signals.push({
    id: 'verified-active',
    tone: 'positive',
    label: 'Verified active',
    reason:
      "This listing was found in the company's official job feed and is removed automatically when it disappears from the source.",
    source: 'ingestion',
  })

  return signals
}

/** Tone ordering for display: positives, then cautions, then neutrals. */
export function sortEvidence(signals: EvidenceSignal[]): EvidenceSignal[] {
  const order: Record<EvidenceTone, number> = {
    positive: 0,
    caution: 1,
    neutral: 2,
  }
  return [...signals].sort((a, b) => order[a.tone] - order[b.tone])
}
