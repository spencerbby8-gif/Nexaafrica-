import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { COUNTRIES } from '@/lib/countries'
import { GUIDES } from '@/lib/guides'
import { INTENTS } from '@/lib/intents'
import { siteUrl } from '@/lib/site'

// Cache 10 minutes — the founder hits this manually or via uptime checks,
// so we don't need real-time freshness.
export const revalidate = 600

/**
 * Lightweight SEO health snapshot — now uses the cookie-free public client
 * (same as sitemap) so it never 500s on the metadata-route env quirk and
 * never pulls 5000 rows through the auth-aware queries.ts path.
 * Freshness is judged on posted_at (real provider date) with created_at
 * fallback, matching sitemap & role metadata logic.
 */
export async function GET() {
  const supabase = createPublicClient()
  const base = siteUrl()
  const now = new Date().toISOString()

  // Pull a bounded sample for freshness math — enough for 7/30d buckets but
  // cheap. Count queries for exact totals.
  const [sampleRes, activeCountRes, africaCountRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('slug, posted_at, created_at, expires_at, is_open_to_africa')
      .eq('is_active', true)
      .order('posted_at', { ascending: false })
      .limit(1000),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_open_to_africa', true),
  ])

  const jobs = (sampleRes.data ?? []) as Array<{
    slug: string
    posted_at: string | null
    created_at: string
    expires_at: string | null
    is_open_to_africa: boolean
  }>

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000

  const effectiveDate = (j: typeof jobs[number]) =>
    j.posted_at ? new Date(j.posted_at).getTime() : new Date(j.created_at).getTime()

  const last7d = jobs.filter((j) => effectiveDate(j) >= sevenDaysAgo).length
  const last30d = jobs.filter((j) => effectiveDate(j) >= thirtyDaysAgo).length

  const expired = jobs.filter(
    (j) => j.expires_at && new Date(j.expires_at).getTime() < Date.now(),
  ).length
  const olderThan90d = jobs.filter((j) => effectiveDate(j) < ninetyDaysAgo).length

  const totalActive = activeCountRes.count ?? jobs.length
  // Indexable approximation in sample, but report totalActive minus observed stale ratio
  const sampleStaleRatio = jobs.length ? (expired + olderThan90d) / jobs.length : 0
  const indexableRoles = Math.max(
    0,
    Math.round(totalActive * (1 - sampleStaleRatio)),
  )

  const openToAfrica = africaCountRes.count ?? jobs.filter((j) => j.is_open_to_africa).length

  // Derive company count lightly without scanning all jobs again — reuse map logic
  const { data: companyRows } = await supabase
    .from('jobs')
    .select('company')
    .eq('is_active', true)
    .limit(2000)
  const companySet = new Set<string>()
  for (const r of companyRows ?? []) {
    const c = (r as { company: string | null }).company
    if (c) companySet.add(c.toLowerCase())
  }

  return NextResponse.json(
    {
      generatedAt: now,
      siteUrl: base,
      sitemap: `${base}/sitemap.xml`,
      robots: `${base}/robots.txt`,
      verification: {
        google: Boolean(process.env.GOOGLE_SITE_VERIFICATION),
        bing: Boolean(process.env.BING_SITE_VERIFICATION),
        yandex: Boolean(process.env.YANDEX_VERIFICATION),
      },
      counts: {
        roles: totalActive,
        rolesSample: jobs.length,
        rolesIndexable: indexableRoles,
        rolesOpenToAfrica: openToAfrica,
        companies: companySet.size,
        countries: COUNTRIES.length,
        guides: GUIDES.length,
        intents: INTENTS.length,
      },
      freshness: {
        rolesLast7d: last7d,
        rolesLast30d: last30d,
        rolesExpiredSample: expired,
        rolesOlderThan90dSample: olderThan90d,
      },
      sample: {
        intents: INTENTS.slice(0, 3).map((i) => `${base}/remote-jobs/search/${i.slug}`),
        countries: COUNTRIES.slice(0, 3).map((c) => `${base}/remote-jobs/${c.slug}`),
        roles: jobs.slice(0, 3).map((j) => `${base}/role/${j.slug}`),
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
  )
}
