import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/types'

const JOB_COLUMNS =
  'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, intelligence, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at, trust_score, trust_confidence, is_flagged'

/**
 * Derived company directory.
 *
 * We don't have a separate companies table — companies are derived from
 * distinct `jobs.company` values. This keeps the system maintainable and
 * gives us crawlable /companies and /companies/[slug] pages without any
 * extra schema or content moderation.
 */

export interface CompanyAggregate {
  slug: string
  name: string
  logo: string | null
  jobCount: number
  africaFriendlyCount: number
  remoteCount: number
  categories: string[]
  countries: string[]
  latestJobAt: string
}

export function companyToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Fetch all companies with at least one active job, aggregated.
 * Uses posted_at for freshness per Job Refresh Engine, not created_at.
 * Capped by `limit` for sitemap performance.
 */
export async function getCompanies(limit = 500): Promise<CompanyAggregate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'company, company_logo, category, country, is_open_to_africa, is_remote, posted_at, created_at',
    )
    .order('posted_at', { ascending: false })
    .limit(2000)
  if (error) {
    console.error('[v0] getCompanies error', error.message)
    return []
  }

  const map = new Map<string, CompanyAggregate>()
  for (const row of data ?? []) {
    const name = (row as { company: string }).company
    if (!name) continue
    const slug = companyToSlug(name)
    const existing = map.get(slug)
    const r = row as {
      company: string
      company_logo: string | null
      category: string | null
      country: string | null
      is_open_to_africa: boolean | null
      is_remote: boolean | null
      posted_at: string
      created_at: string
    }
    const effectiveDate = r.posted_at || r.created_at
    if (existing) {
      existing.jobCount += 1
      if (r.is_open_to_africa) existing.africaFriendlyCount += 1
      if (r.is_remote) existing.remoteCount += 1
      if (r.category && !existing.categories.includes(r.category)) {
        existing.categories.push(r.category)
      }
      if (r.country && !existing.countries.includes(r.country)) {
        existing.countries.push(r.country)
      }
      if (effectiveDate > existing.latestJobAt) {
        existing.latestJobAt = effectiveDate
      }
      if (!existing.logo && r.company_logo) {
        existing.logo = r.company_logo
      }
    } else {
      map.set(slug, {
        slug,
        name,
        logo: r.company_logo ?? null,
        jobCount: 1,
        africaFriendlyCount: r.is_open_to_africa ? 1 : 0,
        remoteCount: r.is_remote ? 1 : 0,
        categories: r.category ? [r.category] : [],
        countries: r.country ? [r.country] : [],
        latestJobAt: effectiveDate,
      })
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export async function getCompanyBySlug(
  slug: string,
): Promise<{ company: CompanyAggregate; jobs: Job[] } | null> {
  const supabase = await createClient()
  // Look up the canonical company name by scanning recent rows.
  // Uses posted_at for freshness per refresh engine.
  const { data: rows, error } = await supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .order('posted_at', { ascending: false })
    .limit(1000)
  if (error) {
    console.error('[v0] getCompanyBySlug error', error.message)
    return null
  }
  const matches = (rows ?? []).filter(
    (r) => companyToSlug((r as Job).company) === slug,
  ) as Job[]
  if (matches.length === 0) return null

  const name = matches[0].company
  const logo = matches.find((m) => m.company_logo)?.company_logo ?? null
  const company: CompanyAggregate = {
    slug,
    name,
    logo,
    jobCount: matches.length,
    africaFriendlyCount: matches.filter((m) => m.is_open_to_africa).length,
    remoteCount: matches.filter((m) => m.is_remote).length,
    categories: Array.from(new Set(matches.map((m) => m.category))),
    countries: Array.from(new Set(matches.map((m) => m.country).filter(Boolean))),
    latestJobAt: matches[0].posted_at || matches[0].created_at,
  }

  return { company, jobs: matches }
}
