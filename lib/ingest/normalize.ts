import type { EmploymentType } from '@/lib/types'
import type { JobIntelligence } from '@/lib/intelligence'

/**
 * Shared normalization for ingested jobs. Every ATS adapter should run its
 * raw output through these helpers so the upserted rows are consistent
 * regardless of source.
 */

const CATEGORY_RULES: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: 'engineering',
    patterns: [
      /\b(software|backend|frontend|full[\s-]?stack|mobile|ios|android|devops|sre|platform|infrastructure|security|data|ml|machine learning|ai)\s+engineer\b/i,
      /\bengineer(ing)?\b/i,
      /\bdeveloper\b/i,
      /\barchitect\b/i,
      /\bprogrammer\b/i,
    ],
  },
  {
    category: 'product',
    patterns: [/\bproduct\s+(manager|owner|lead|director)\b/i, /\bpm\b/i, /\bproduct\s+ops\b/i],
  },
  {
    category: 'design',
    patterns: [
      /\b(ux|ui|product|graphic|visual|brand|web|motion)\s*designer?\b/i,
      /\bdesigner\b/i,
      /\bresearcher\b/i,
    ],
  },
  {
    category: 'marketing',
    patterns: [
      /\bmarketing\b/i,
      /\bgrowth\b/i,
      /\bcontent\b/i,
      /\bseo\b/i,
      /\bcopywriter\b/i,
      /\bbrand\b/i,
      /\bsocial\s+media\b/i,
      /\bcommunications?\b/i,
    ],
  },
  {
    category: 'sales',
    patterns: [
      /\bsales\b/i,
      /\baccount\s+(executive|manager)\b/i,
      /\bbusiness\s+development\b/i,
      /\bbdr\b/i,
      /\bsdr\b/i,
      /\brevenue\b/i,
    ],
  },
  {
    category: 'customer-support',
    patterns: [
      /\b(customer|client)\s+(support|success|experience|service)\b/i,
      /\bsupport\s+(specialist|agent|engineer)\b/i,
      /\bhelp\s*desk\b/i,
      /\btechnical\s+support\b/i,
    ],
  },
  {
    category: 'operations',
    patterns: [
      /\boperations?\b/i,
      /\bops\b/i,
      /\bproject\s+manager\b/i,
      /\bprogram\s+manager\b/i,
      /\bchief\s+of\s+staff\b/i,
    ],
  },
  {
    category: 'data',
    patterns: [
      /\bdata\s+(analyst|scientist|engineer)\b/i,
      /\banalyst\b/i,
      /\banalytics\b/i,
      /\bbi\b/i,
    ],
  },
  {
    category: 'virtual-assistant',
    patterns: [
      /\bvirtual\s+assistant\b/i,
      /\bexecutive\s+assistant\b/i,
      /\badministrative\s+assistant\b/i,
      /\bremote\s+assistant\b/i,
    ],
  },
  {
    category: 'finance',
    patterns: [
      /\b(finance|accounting|bookkeep|controller|treasury|fp&a)\b/i,
      /\baccountant\b/i,
    ],
  },
  {
    category: 'people',
    patterns: [
      /\b(human\s+resources|people\s+(ops|operations)|recruiter|talent)\b/i,
      /\bhr\b/i,
    ],
  },
]

/**
 * Map a job title to one of our canonical category slugs.
 * Returns "other" only when nothing matches — adapters should usually
 * pass an explicit hint when they have one (e.g. Greenhouse departments).
 */
export function categorizeTitle(title: string, hint?: string | null): string {
  const haystack = `${hint ?? ''} ${title}`
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((re) => re.test(haystack))) return rule.category
  }
  return 'other'
}

const REMOTE_PATTERNS: RegExp[] = [
  /\bremote\b/i,
  /\bworldwide\b/i,
  /\banywhere\b/i,
  /\bdistributed\b/i,
  /\bglobal\b/i,
  /\bvirtual\b/i,
  /\bwork[\s-]from[\s-]home\b/i,
  /\bwfh\b/i,
]

const ONSITE_NEGATIVE: RegExp[] = [
  /\bon[\s-]?site\b/i,
  /\bin[\s-]?office\b/i,
  /\bhybrid\b/i, // hybrid is not remote-first; we exclude
]

export function detectRemote(...fields: Array<string | null | undefined>): boolean {
  const text = fields.filter(Boolean).join(' ')
  if (!text) return false
  // If the location/title explicitly says hybrid/onsite, reject.
  if (ONSITE_NEGATIVE.some((re) => re.test(text)) && !REMOTE_PATTERNS.some((re) => re.test(text))) {
    return false
  }
  return REMOTE_PATTERNS.some((re) => re.test(text))
}

import type { Eligibility } from '@/lib/types'

/**
 * EXPLICIT Africa signals — eligibility is clearly compatible with African
 * applicants. These are strong enough to override soft restriction noise.
 */
const AFRICA_EXPLICIT = [
  /\bafrica\b/i,
  /\bemea\b/i,
  /\b(nigeria|kenya|south\s+africa|ghana|egypt|morocco|ethiopia|tanzania|uganda|rwanda|senegal|tunisia|ivory\s+coast|côte\s+d['’]ivoire|cameroon|zambia|zimbabwe|botswana|namibia|mozambique|angola)\b/i,
]

/**
 * GLOBAL-REMOTE signals. On their own these mean "likely open" at best — NOT
 * explicit Africa eligibility. The audit showed treating these as sufficient
 * produced the bulk of false positives, so they only ever yield 'likely'.
 */
const GLOBAL_REMOTE = [
  /\bworldwide\b/i,
  /\banywhere\b/i,
  /\bglobal(ly)?\b/i,
  /\bany\s+(time\s*zone|location|country)\b/i,
  /\bfully\s+remote\b/i,
  /\bremote\s*[-—,]?\s*(global|worldwide|anywhere|international)\b/i,
]

/**
 * RESTRICTION signals — region, residency, or work-authorization limits that
 * exclude (or very likely exclude) African applicants. Expanded well beyond
 * the old "X only" list to catch how restrictions are really phrased.
 */
const RESTRICTION = [
  // explicit "X only"
  /\b(us|u\.s\.|usa|united\s+states|na|north\s+america|eu|europe|uk|u\.k\.|united\s+kingdom|canada|emea\s+excluding\s+africa|latam|apac|australia|india)\s+(?:based\s+)?only\b/i,
  // residency / location requirements
  /\bmust\s+(?:be\s+)?(?:reside|live|be\s+located|be\s+based)\b/i,
  /\b(?:based|located|residing|resident)\s+in\s+the\s+(us|usa|united\s+states|uk|united\s+kingdom|eu|european\s+union|canada|us\b)/i,
  /\bcandidates?\s+(?:must\s+be\s+)?(?:located|based|residing)\s+in\b/i,
  /\bapplicants?\s+(?:must\s+be\s+)?from\b/i,
  /\bresidents?\s+only\b/i,
  // work authorization
  /\b(?:work\s+)?authoriz(?:ed|ation)\s+(?:to\s+work\s+)?in\s+the\s+(us|usa|united\s+states|uk|united\s+kingdom|eu|european\s+union|canada)\b/i,
  /\beligible\s+to\s+work\s+in\s+the\s+(us|usa|united\s+states|uk|united\s+kingdom|eu|european\s+union|canada)\b/i,
  /\b(us|u\.s\.|uk|u\.k\.|eu)\s+work\s+authoriz(?:ation|ed)\b/i,
  /\b(?:legally\s+)?authorized\s+to\s+work\b/i,
  /\bvisa\s+sponsorship\s+(?:is\s+)?(?:not\s+available|unavailable|not\s+provided)\b/i,
  /\bno\s+visa\s+sponsorship\b/i,
  /\bsecurity\s+clearance\b/i,
  /\b(?:gc|green\s+card)\s+(?:holder|required)\b/i,
]

/**
 * Classify Africa eligibility into a confidence tier. Accuracy over optimism:
 * - A restriction signal forces 'restricted' UNLESS Africa is explicitly named
 *   (some global postings list region carve-outs but still welcome Africa).
 * - Explicit Africa wording => 'explicit'.
 * - Global-remote signals with no restriction => 'likely' (a hedge, not a claim).
 * - Otherwise => 'unknown'. We never guess 'open' from silence.
 */
export function classifyEligibility(...fields: Array<string | null | undefined>): Eligibility {
  const text = fields.filter(Boolean).join(' ').toLowerCase()
  if (!text) return 'unknown'

  const explicit = AFRICA_EXPLICIT.some((re) => re.test(text))
  const restricted = RESTRICTION.some((re) => re.test(text))
  const global = GLOBAL_REMOTE.some((re) => re.test(text))

  // Explicit Africa mention wins — even over a region carve-out, since the
  // employer has named Africa/an African country as welcome.
  if (explicit) return 'explicit'
  // Any restriction without explicit Africa support => restricted.
  if (restricted) return 'restricted'
  // Global remote with no restriction => moderate confidence.
  if (global) return 'likely'
  return 'unknown'
}

/**
 * Derived convenience flag preserved for existing filters/hubs. Only the two
 * confident-positive tiers count as "open to Africa".
 */
export function isOpenToAfrica(eligibility: Eligibility): boolean {
  return eligibility === 'explicit' || eligibility === 'likely'
}

/**
 * Legacy adapter-level employment hint. Phase 16 removed the silent
 * `full_time` default — when nothing matches we now return 'unknown' and let
 * the Intelligence Engine (lib/intelligence.ts) make the authoritative call at
 * enrichment time. Adapters still pass their real ATS commitment field first,
 * which remains the strongest signal.
 */
export function detectEmploymentType(
  ...fields: Array<string | null | undefined>
): EmploymentType {
  const text = fields.filter(Boolean).join(' ').toLowerCase()
  if (/\b(intern(ship)?)\b/.test(text)) return 'internship'
  if (/\bfreelancer?\b/.test(text)) return 'freelance'
  if (/\bconsultant\b/.test(text)) return 'consultant'
  if (/\b(contract|contractor|independent contractor|1099)\b/.test(text)) return 'contract'
  if (/\btemporary\b|\btemp\s+(role|position|contract)\b/.test(text)) return 'temporary'
  if (/\bpart[\s-]?time\b/.test(text)) return 'part_time'
  if (/\bfull[\s-]?time\b|\bpermanent\b/.test(text)) return 'full_time'
  return 'unknown'
}

/**
 * Best-effort country resolver. Returns canonical short names that match
 * what the rest of the app expects. "Worldwide" is the safe default for
 * truly global roles since most country hubs treat it as "open to here".
 */
export function resolveCountry(rawLocation: string | null | undefined): string {
  if (!rawLocation) return 'Worldwide'
  const s = rawLocation.toLowerCase()
  if (/\b(worldwide|anywhere|global|remote)\b/.test(s) && !/\b(in|—|-)\b/.test(s)) {
    return 'Worldwide'
  }
  if (/\bafrica\b/.test(s)) return 'Africa'
  if (/\bemea\b/.test(s)) return 'EMEA'
  if (/\bnigeria\b/.test(s)) return 'Nigeria'
  if (/\bkenya\b/.test(s)) return 'Kenya'
  if (/\bsouth\s+africa\b/.test(s)) return 'South Africa'
  if (/\bghana\b/.test(s)) return 'Ghana'
  if (/\begypt\b/.test(s)) return 'Egypt'
  if (/\bmorocco\b/.test(s)) return 'Morocco'
  if (/\bunited\s+kingdom\b|\buk\b|\bengland\b/.test(s)) return 'United Kingdom'
  if (/\bunited\s+states\b|\busa?\b/.test(s)) return 'United States'
  if (/\bcanada\b/.test(s)) return 'Canada'
  if (/\bgermany\b/.test(s)) return 'Germany'
  if (/\bnetherlands\b/.test(s)) return 'Netherlands'
  if (/\bportugal\b/.test(s)) return 'Portugal'
  if (/\bspain\b/.test(s)) return 'Spain'
  if (/\bfrance\b/.test(s)) return 'France'
  if (/\bireland\b/.test(s)) return 'Ireland'
  return 'Worldwide'
}

/**
 * Strip HTML to plain markdown-ish text. Proper HTML parsing, not regex.
 * Uses `he` for entity decoding first, then `node-html-parser` for structural cleaning.
 * - Decodes &lt;div&gt; etc before stripping (fixes raw HTML bug)
 * - Removes script, style, comments
 * - Converts block tags to newlines to preserve paragraph spacing
 * - Strips inline styles/tags
 * - Collapses whitespace
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  try {
    // Dynamic requires to avoid bundling issues in edge runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // @ts-ignore
    const he = require('he')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // @ts-ignore
    const { parse } = require('node-html-parser')

    // 1. Decode entities FIRST — so &lt;div&gt; becomes <div> and can be stripped as tag, not left as raw text
    let decoded = he.decode(html)

    // 2. Parse with proper parser
    const root = parse(decoded, {
      blockTextElements: {
        script: false,
        style: false,
        pre: false,
      },
      comment: false,
    })

    // Remove unwanted elements
    root.querySelectorAll('script, style, noscript, iframe, form, button').forEach((el: any) => el.remove())

    // Convert block elements to newlines before extracting text
    // Replace <br> with \n, </p> and </li> and headings with \n\n
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'br', 'ul', 'ol']
    blockTags.forEach(tag => {
      root.querySelectorAll(tag).forEach((el: any) => {
        if (tag === 'br') {
          el.replaceWith('\n')
        } else if (tag === 'li') {
          el.insertAdjacentHTML('beforebegin', '- ')
          el.insertAdjacentHTML('afterend', '\n')
        } else {
          // Add newlines around block
          el.insertAdjacentHTML('beforebegin', '\n\n')
          el.insertAdjacentHTML('afterend', '\n\n')
        }
      })
    })

    // Handle <a href> -> [text](url) before stripping
    root.querySelectorAll('a').forEach((el: any) => {
      const href = el.getAttribute('href')
      const text = el.text?.trim()
      if (href && text && href.startsWith('http')) {
        el.replaceWith(`[${text}](${href})`)
      }
    })

    // Handle bold/strong, em
    root.querySelectorAll('strong, b').forEach((el: any) => {
      const text = el.text?.trim()
      if (text) el.replaceWith(`**${text}**`)
    })
    root.querySelectorAll('em, i').forEach((el: any) => {
      const text = el.text?.trim()
      if (text) el.replaceWith(`_${text}_`)
    })

    let text = root.text || root.innerText || ''

    // 3. Final cleanup
    return text
      // Remove zero-width chars
      .replace(/\u0000/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Normalize line breaks
      .replace(/\r\n?/g, '\n')
      // Collapse multiple spaces but keep paragraph breaks
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch (e) {
    // Fallback to old regex method if parser fails, but decode entities first (fixes original bug)
    try {
      // @ts-ignore
      const he = require('he')
      let decoded = he.decode(html)
      return decoded
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<h[1-6][^>]*>/gi, '\n## ')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    } catch {
      // Ultimate fallback
      return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
    }
  }
}

/**
 * Generate a clean readable excerpt 180-250 chars from cleaned text.
 * Preserves sentence boundaries, decodes entities, no HTML.
 */
export function generateExcerpt(cleanedText: string, minLen = 180, maxLen = 250): string {
  if (!cleanedText) return ''
  // Already cleaned, but ensure no HTML remains
  let text = cleanedText.replace(/\s+/g, ' ').trim()

  if (text.length <= maxLen) return text

  // Try to cut at sentence boundary within min-max range
  let excerpt = text.slice(0, maxLen)
  const lastPeriod = excerpt.lastIndexOf('. ')
  const lastExcl = excerpt.lastIndexOf('! ')
  const lastQ = excerpt.lastIndexOf('? ')
  const lastSentenceEnd = Math.max(lastPeriod, lastExcl, lastQ)

  if (lastSentenceEnd > minLen) {
    excerpt = excerpt.slice(0, lastSentenceEnd + 1)
  } else {
    // Cut at last space to avoid mid-word
    const lastSpace = excerpt.lastIndexOf(' ')
    if (lastSpace > minLen) {
      excerpt = excerpt.slice(0, lastSpace)
    }
  }

  // Ensure it ends with punctuation or ellipsis
  if (!/[.!?]$/.test(excerpt.trim())) {
    excerpt = excerpt.trim() + '…'
  }

  return excerpt.trim()
}

/**
 * Extract a human-readable salary range from free text. Conservative —
 * we'd rather return null than fabricate. Catches "$80,000 - $100,000",
 * "USD 80k - 100k", "€60k–€80k".
 */
export function extractSalary(...fields: Array<string | null | undefined>): string | null {
  const text = fields.filter(Boolean).join(' ')
  if (!text) return null
  const re =
    /(USD|EUR|GBP|\$|€|£)\s?(\d{2,3}(?:[,.]?\d{3})?(?:k)?)\s?[-–—to]+\s?(USD|EUR|GBP|\$|€|£)?\s?(\d{2,3}(?:[,.]?\d{3})?(?:k)?)/i
  const m = text.match(re)
  if (!m) return null
  return m[0].trim()
}

/**
 * Parse a provider posting date into an ISO string. Accepts ISO strings and
 * epoch milliseconds (Lever). Rejects implausible dates (future, or before
 * 2005 — older than any live remote ATS listing) so a bad provider value can
 * never poison freshness. Returns null when no trustworthy date is available;
 * the ingest layer then falls back to the existing created_at.
 */
export function parsePostedDate(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw)
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  const now = Date.now()
  // Allow a small clock-skew window into the future, reject the rest.
  if (t > now + 24 * 60 * 60 * 1000) return null
  if (t < new Date('2005-01-01').getTime()) return null
  return d.toISOString()
}

export interface NormalizedJob {
  title: string
  company: string
  company_logo: string | null
  description_md: string
  apply_url: string
  category: string
  location: string | null
  country: string
  salary_range: string | null
  /**
   * Structured salary (Phase 16). Adapters may omit these; they are populated
   * centrally by enrichIntelligence() in run.ts before upsert.
   */
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string | null
  salary_period?: string | null
  employment_type: EmploymentType
  tags: string[]
  is_remote: boolean
  is_open_to_africa: boolean
  eligibility: Eligibility
  /**
   * Persisted intelligence signal store (Phase 16). Populated centrally by
   * enrichIntelligence() in run.ts; adapters need not set it.
   */
  intelligence?: JobIntelligence
  /** Real provider posting date (ISO), or null when the source exposes none. */
  posted_at: string | null
  source: string
  source_id: string
  expires_at: string | null
}
