/**
 * Canonical country registry for SEO surface area.
 *
 * Each entry powers /remote-jobs/[slug] and seeds programmatic
 * category × country pages. Copy is calm, factual, recruiter-oriented —
 * not keyword stuffing. Only countries we can serve meaningfully.
 */

export type CountrySlug =
  | 'nigeria'
  | 'kenya'
  | 'south-africa'
  | 'ghana'
  | 'egypt'
  | 'morocco'
  | 'rwanda'
  | 'uganda'
  | 'ethiopia'
  | 'tanzania'
  | 'worldwide'

export interface CountryEntry {
  slug: CountrySlug
  /** Display name as used in the `jobs.country` column. */
  name: string
  /** ISO 3166-1 alpha-2 (optional, for schema.org). */
  iso?: string
  /** True for African countries — used to drive Open-to-Africa surfacing. */
  isAfrican: boolean
  /** Short, factual context for the page intro. */
  intro: string
  /** Notes shown on the country hub explaining hiring reality. */
  hiringNote: string
}

export const COUNTRIES: CountryEntry[] = [
  {
    slug: 'nigeria',
    name: 'Nigeria',
    iso: 'NG',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Nigeria. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Lagos and Abuja have the largest concentration of remote-ready talent on the continent. Most roles below accept Nigerian applicants without visa sponsorship since the work is fully remote.',
  },
  {
    slug: 'kenya',
    name: 'Kenya',
    iso: 'KE',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Kenya. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Nairobi is a regional hub for fintech, climate, and developer-tools companies hiring across East Africa. Many global teams have engineers based here on UTC+3.',
  },
  {
    slug: 'south-africa',
    name: 'South Africa',
    iso: 'ZA',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from South Africa. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Cape Town and Johannesburg have the deepest pool of senior remote engineers, designers, and operators on the continent. SAST timezone overlaps well with Europe.',
  },
  {
    slug: 'ghana',
    name: 'Ghana',
    iso: 'GH',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Ghana. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Accra has a fast-growing remote tech scene, particularly in fintech and customer operations. GMT timezone overlaps with London business hours.',
  },
  {
    slug: 'egypt',
    name: 'Egypt',
    iso: 'EG',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Egypt. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Cairo has one of the largest pools of remote engineers in MENA. EET timezone aligns well with European hiring teams.',
  },
  {
    slug: 'morocco',
    name: 'Morocco',
    iso: 'MA',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Morocco. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Casablanca and Rabat have growing pools of bilingual (French/English) remote talent. Strong fit for EU-headquartered teams.',
  },
  {
    slug: 'rwanda',
    name: 'Rwanda',
    iso: 'RW',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Rwanda. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Kigali is one of the easiest African cities to operate from remotely — strong fiber, stable power, and English as a working language.',
  },
  {
    slug: 'uganda',
    name: 'Uganda',
    iso: 'UG',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Uganda. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Kampala has a growing remote workforce particularly in customer support, content, and entry-level engineering. EAT timezone.',
  },
  {
    slug: 'ethiopia',
    name: 'Ethiopia',
    iso: 'ET',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Ethiopia. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Addis Ababa has a young, fast-growing tech workforce. Strong fit for entry-level remote operations and engineering roles.',
  },
  {
    slug: 'tanzania',
    name: 'Tanzania',
    iso: 'TZ',
    isAfrican: true,
    intro:
      'Remote roles open to candidates working from Tanzania. Companies on Nexa pay in USD or EUR and review applicants directly.',
    hiringNote:
      'Dar es Salaam has a growing remote tech and operations workforce, particularly in fintech and impact-focused teams.',
  },
  {
    slug: 'worldwide',
    name: 'Worldwide',
    isAfrican: false,
    intro:
      'Remote roles open globally. Companies on Nexa pay in USD or EUR and review applicants directly without intermediaries.',
    hiringNote:
      'All roles are remote-first. Where a role has timezone or location restrictions, we surface that directly on the listing.',
  },
]

const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]))

export function getCountry(slug: string): CountryEntry | null {
  return BY_SLUG.get(slug as CountrySlug) ?? null
}

export function isCountrySlug(slug: string): slug is CountrySlug {
  return BY_SLUG.has(slug as CountrySlug)
}

/** Convert a free-form `jobs.country` value to a URL-safe slug. */
export function countryToSlug(country: string): string {
  return country.toLowerCase().trim().replace(/\s+/g, '-')
}

export const AFRICAN_COUNTRIES = COUNTRIES.filter((c) => c.isAfrican)
