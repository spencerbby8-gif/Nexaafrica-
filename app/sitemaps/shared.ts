import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { companyToSlug } from '@/lib/companies'
import { COUNTRIES } from '@/lib/countries'
import { GUIDES } from '@/lib/guides'
import { INTENTS } from '@/lib/intents'
import { siteUrl } from '@/lib/site'
import { JOBS_PER_SITEMAP_CHUNK, SITEMAP_JOB_MAX_AGE_DAYS, isFreshJobForSitemap } from '@/lib/sitemapPolicy'

/**
 * [PHASE-3] Shared machinery for the /sitemaps surface (route handlers).
 * Route handlers are the documented Next pattern for server-side sitemap
 * indexes (they give explicit revalidation/cache semantics), and they avoid
 * the reserved `sitemap.xml` metadata-file convention entirely.
 */

export const SITEMAP_REVALIDATE_SECONDS = 1800

export function sitemapResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Material eligibility changes must reach crawlers within the
      // revalidation window — never gated on a deployment.
      'Cache-Control': `public, s-maxage=${SITEMAP_REVALIDATE_SECONDS}, stale-while-revalidate=${SITEMAP_REVALIDATE_SECONDS * 2}`,
    },
  })
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Serialize MetadataRoute.Sitemap entries into a <urlset> document. */
export function urlsetXml(entries: MetadataRoute.Sitemap): string {
  const body = entries
    .map((e) => {
      const lastmod = e.lastModified
        ? `    <lastmod>${new Date(e.lastModified).toISOString()}</lastmod>\n`
        : ''
      const freq = e.changeFrequency ? `    <changefreq>${xmlEscape(String(e.changeFrequency))}</changefreq>\n` : ''
      const prio = typeof e.priority === 'number' ? `    <priority>${e.priority}</priority>\n` : ''
      return `  <url>\n    <loc>${xmlEscape(e.url)}</loc>\n${lastmod}${freq}${prio}  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export function getSupabaseOrNull() {
  try {
    return createPublicClient()
  } catch (e) {
    console.warn('[sitemaps] Supabase env missing — degraded response', (e as Error).message)
    return null
  }
}

/** PostgREST filter chain implementing the Phase 2/3 indexability contract. */
export function applyJobIndexabilityFilters<T extends {
  eq: Function; in: Function; neq: Function; is: Function; gte: Function; or: Function
}>(query: T): T {
  const cutoff = new Date(Date.now() - SITEMAP_JOB_MAX_AGE_DAYS * 86_400_000).toISOString()
  return query
    .eq('is_active', true)
    .in('eligibility', ['explicit', 'likely']) // restricted AND unknown never indexed
    .eq('is_open_to_africa', true)
    .neq('is_remote', false) // Phase 2 hybrid/onsite write-back
    .is('duplicate_of', null)
    .gte('posted_at', cutoff)
    .or('expires_at.is.null,expires_at.gt.now') as T
}

export async function countIndexableJobs(): Promise<number> {
  const supabase = getSupabaseOrNull()
  if (!supabase) return 0
  try {
    const { count, error } = await applyJobIndexabilityFilters(
      supabase.from('jobs').select('id', { count: 'exact', head: true }),
    )
    if (error || count == null) return 0
    return count
  } catch {
    return 0
  }
}

/** ids the AI judged Africa-restricted — excluded in JS (no giant URL filters). */
export async function fetchAiRestrictedIds(): Promise<Set<string>> {
  const supabase = getSupabaseOrNull()
  if (!supabase) return new Set()
  try {
    const { data } = await supabase
      .from('job_ai_intelligence')
      .select('job_id')
      .eq('africa_eligibility', 'restricted')
      .limit(5000)
    return new Set((data || []).map((r: any) => r.job_id).filter(Boolean))
  } catch {
    return new Set()
  }
}

interface JobRow {
  id: string
  slug: string
  posted_at: string | null
  created_at: string | null
  expires_at: string | null
}

/** One deterministic chunk of indexable job URLs. */
export async function jobChunkEntries(chunkIndex: number): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const now = new Date()
  const supabase = getSupabaseOrNull()
  if (!supabase) return []

  const aiRestricted = await fetchAiRestrictedIds()

  // PostgREST caps a single SELECT at 1,000 rows — sub-paginate so a chunk
  // delivers its full JOBS_PER_SITEMAP_CHUNK window with identical ordering.
  const rows: JobRow[] = []
  try {
    const PAGE = 1000
    const chunkStart = chunkIndex * JOBS_PER_SITEMAP_CHUNK
    let fetched = 0
    while (fetched < JOBS_PER_SITEMAP_CHUNK) {
      const start = chunkStart + fetched
      const pageEnd = Math.min(start + PAGE, chunkStart + JOBS_PER_SITEMAP_CHUNK) - 1
      const res = await applyJobIndexabilityFilters(
        supabase
          .from('jobs')
          .select('id, slug, posted_at, created_at, expires_at')
          .order('posted_at', { ascending: false })
          .order('slug', { ascending: true })
          .range(start, pageEnd),
      )
      if (res.error || !res.data) break
      const page = res.data as JobRow[]
      rows.push(...page)
      fetched += page.length
      if (page.length < pageEnd - start + 1) break // inventory exhausted
    }
  } catch {
    // Degraded: emit whatever was collected — never 500 a sitemap.
  }
  return rows
    .filter((r) => r.slug && !aiRestricted.has(r.id))
    .filter((r) => isFreshJobForSitemap(r, now.getTime()))
    .map((r) => ({
      url: `${base}/role/${r.slug}`,
      lastModified: new Date(r.posted_at ?? r.created_at ?? now),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
}

/** Core (non-job) surface: static pages, intents, hubs, companies, guides. */
export async function coreEntries(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const now = new Date()
  const supabase = getSupabaseOrNull()

  let companies: Array<{ slug: string; latestJobAt: string }> = []
  let categories: Array<{ slug: string }> = []

  if (supabase) {
    const [companiesRes, categoriesRes] = await Promise.allSettled([
      applyJobIndexabilityFilters(
        supabase
          .from('jobs')
          .select('company, posted_at, created_at')
          .order('posted_at', { ascending: false })
          .limit(5000),
      ),
      supabase.from('categories').select('slug').order('title', { ascending: true }),
    ])

    const companyRows: Array<{ company: string | null; posted_at: string | null; created_at: string | null }> =
      companiesRes.status === 'fulfilled' && !companiesRes.value.error ? ((companiesRes.value.data ?? []) as any) : []
    categories =
      categoriesRes.status === 'fulfilled' && !categoriesRes.value.error ? ((categoriesRes.value.data ?? []) as any) : []

    const companyMap = new Map<string, { latestJobAt: string }>()
    for (const row of companyRows) {
      if (!row.company) continue
      const slug = companyToSlug(row.company)
      if (!slug) continue
      const effective = row.posted_at || row.created_at || ''
      const existing = companyMap.get(slug)
      if (existing) {
        if (effective > existing.latestJobAt) existing.latestJobAt = effective
      } else {
        companyMap.set(slug, { latestJobAt: effective })
      }
    }
    companies = Array.from(companyMap.entries()).map(([slug, v]) => ({ slug, latestJobAt: v.latestJobAt }))
  }

  const safeDate = (value: string | null | undefined, fallback: Date): Date => {
    if (!value) return fallback
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? fallback : d
  }

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

  const intentUrls: MetadataRoute.Sitemap = INTENTS.map((i) => ({
    url: `${base}/remote-jobs/search/${i.slug}`,
    lastModified: safeDate(i.updatedAt, now),
    changeFrequency: 'daily',
    priority: i.slug === 'open-to-africa' ? 0.9 : 0.75,
  }))

  const countryUrls: MetadataRoute.Sitemap = COUNTRIES.map((c) => ({
    url: `${base}/remote-jobs/${c.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: c.isAfrican ? 0.85 : 0.7,
  }))

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

  const companyUrls: MetadataRoute.Sitemap = companies.map((c) => ({
    url: `${base}/companies/${c.slug}`,
    lastModified: safeDate(c.latestJobAt, now),
    changeFrequency: 'weekly',
    priority: 0.65,
  }))

  const guideUrls: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${base}/guides/${g.slug}`,
    lastModified: safeDate(g.updatedAt ?? g.publishedAt, now),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticUrls, ...intentUrls, ...countryUrls, ...categoryCountryUrls, ...companyUrls, ...guideUrls]
}
