import type { EmploymentType } from '@/lib/types'

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

const AFRICA_INDICATORS = [
  /\bafrica\b/i,
  /\bemea\b/i,
  /\bworldwide\b/i,
  /\banywhere\b/i,
  /\bglobal\b/i,
  /\b(nigeria|kenya|south\s+africa|ghana|egypt|morocco|ethiopia|tanzania|uganda|rwanda|senegal)\b/i,
]

const AFRICA_NEGATIVE = [
  /\bus\s+only\b/i,
  /\bunited\s+states\s+only\b/i,
  /\bna\s+only\b/i,
  /\bnorth\s+america\s+only\b/i,
  /\beu\s+only\b/i,
  /\beurope\s+only\b/i,
  /\buk\s+only\b/i,
  /\bcanada\s+only\b/i,
  /\bauthorized\s+to\s+work\s+in\s+the\s+us\b/i,
]

export function detectOpenToAfrica(...fields: Array<string | null | undefined>): boolean {
  const text = fields.filter(Boolean).join(' ').toLowerCase()
  if (!text) return false
  if (AFRICA_NEGATIVE.some((re) => re.test(text))) return false
  return AFRICA_INDICATORS.some((re) => re.test(text))
}

export function detectEmploymentType(
  ...fields: Array<string | null | undefined>
): EmploymentType {
  const text = fields.filter(Boolean).join(' ').toLowerCase()
  if (/\b(intern(ship)?)\b/.test(text)) return 'internship'
  if (/\b(contract|contractor|freelance|temporary|temp)\b/.test(text)) return 'contract'
  if (/\bpart[\s-]?time\b/.test(text)) return 'part_time'
  return 'full_time'
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
 * Strip HTML to plain markdown-ish text. We're lossy on purpose: ATS HTML
 * is verbose, full of styling, and we render plain markdown anyway.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  employment_type: EmploymentType
  tags: string[]
  is_remote: boolean
  is_open_to_africa: boolean
  source: string
  source_id: string
  expires_at: string | null
}
