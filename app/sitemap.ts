import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { companyToSlug } from '@/lib/companies'
import { COUNTRIES } from '@/lib/countries'
import { GUIDES } from '@/lib/guides'
import { INTENTS } from '@/lib/intents'
import { siteUrl } from '@/lib/site'

// Statically render with ISR. The sitemap reads only public data through a
// cookie-free client, so it can be cached at the edge and regenerated every
// 10 minutes instead of hitting the database on every crawler request.
export const dynamic = 'force-static'
export const revalidate = 600

/** Clamp a date to a valid Date, falling back to `now` for null/invalid. */
function safeDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

interface JobRow {
  slug: string
  posted_at: string | null
  created_at: string
  expires_at: string | null
}
interface CompanyRow {
  company: string | null
  created_at: string
}
interface CategoryRow {
  slug: string
}

async function fetchSitemapData() {
  const supabase = createPublicClient()

  // Each query is isolated: a single failure degrades gracefully to an empty
  // set rather than throwing and turning the whole sitemap into a 5xx
  // ("Couldn't fetch" in Search Console).
  const [jobsRes, companiesRes, categoriesRes] = await Promise.allSettled([
    supabase
      .from('jobs')
      .select('slug, posted_at, created_at, expires_at')
      .eq('is_active', true)
      .order('posted_at', { ascending: false })
      .limit(500),
    supabase
      .from('jobs')
      .select('company, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('categories').select('slug').order('title', { ascending: true }),
  ])

  const jobs: JobRow[] =
    jobsRes.status === 'fulfilled' && !jobsRes.value.error
      ? ((jobsRes.value.data ?? []) as JobRow[])
      : []
  const companyRows: CompanyRow[] =
    companiesRes.status === 'fulfilled' && !companiesRes.value.error
      ? ((companiesRes.value.data ?? []) as CompanyRow[])
      : []
  const categories: CategoryRow[] =
    categoriesRes.status === 'fulfilled' && !categoriesRes.value.error
      ? ((categoriesRes.value.data ?? []) as CategoryRow[])
      : []

  // Derive the company directory (distinct slug -> latest job date), mirroring
  // lib/companies.getCompanies but through the cookie-free client.
  const companyMap = new Map<string, { latestJobAt: string }>()
  for (const row of companyRows) {
    if (!row.company) continue
    const slug = companyToSlug(row.company)
    if (!slug) continue
    const existing = companyMap.get(slug)
    if (existing) {
      if (row.created_at > existing.latestJobAt) existing.latestJobAt = row.created_at
    } else {
      companyMap.set(slug, { latestJobAt: row.created_at })
    }
  }
  const companies = Array.from(companyMap.entries())
    .map(([slug, v]) => ({ slug, latestJobAt: v.latestJobAt }))
    .slice(0, 200)

  return { jobs, companies, categories }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const now = new Date()

  const { jobs, companies, categories } = await fetchSitemapData()

  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/companies`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/guides`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/trust-and-safety`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Country hubs: /remote-jobs/[country]
  const countryUrls: MetadataRoute.Sitemap = COUNTRIES.map((c) => ({
    url: `${base}/remote-jobs/${c.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: c.isAfrican ? 0.85 : 0.7,
  }))

  // Programmatic category × country combinations.
  // Worldwide for every category, plus African countries for richer surface area.
  const categoryCountryUrls: MetadataRoute.Sitemap = []
  for (const cat of categories) {
    for (const country of COUNTRIES) {
      categoryCountryUrls.push({
        url: `${base}/jobs/${cat.slug}/${country.slug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: country.isAfrican ? 0.7 : 0.6,
      })
    }
  }

  // Companies
  const companyUrls: MetadataRoute.Sitemap = companies.map((c) => ({
    url: `${base}/companies/${c.slug}`,
    lastModified: safeDate(c.latestJobAt, now),
    changeFrequency: 'weekly',
    priority: 0.65,
  }))

  // Guides (authority content)
  const guideUrls: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${base}/guides/${g.slug}`,
    lastModified: safeDate(g.updatedAt ?? g.publishedAt, now),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // Individual roles. Drop stale roles (expired or >90d old) — submitting
  // stale URLs to Google wastes crawl budget and hurts Job Posting trust.
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const freshJobs = jobs.filter((j) => {
    if (!j.slug) return false
    if (j.expires_at && new Date(j.expires_at).getTime() < Date.now()) return false
    // Staleness judged on the real posting date, matching JobPosting datePosted.
    const posted = safeDate(j.posted_at ?? j.created_at, now)
    if (posted.getTime() < ninetyDaysAgo) return false
    return true
  })
  const roleUrls: MetadataRoute.Sitemap = freshJobs.map((j) => ({
    url: `${base}/role/${j.slug}`,
    lastModified: safeDate(j.posted_at ?? j.created_at, now),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Search-intent landing pages
  const intentUrls: MetadataRoute.Sitemap = INTENTS.map((i) => ({
    url: `${base}/remote-jobs/search/${i.slug}`,
    lastModified: safeDate(i.updatedAt, now),
    changeFrequency: 'daily',
    // Open-to-Africa is the strategic flagship — surface it strongly.
    priority: i.slug === 'open-to-africa' ? 0.9 : 0.75,
  }))

  return [
    ...staticUrls,
    ...intentUrls,
    ...countryUrls,
    ...categoryCountryUrls,
    ...companyUrls,
    ...guideUrls,
    ...roleUrls,
  ]
}
