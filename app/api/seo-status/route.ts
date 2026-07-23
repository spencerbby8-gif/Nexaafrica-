import { NextResponse } from 'next/server'
import { getJobs } from '@/lib/queries'
import { getCompanies } from '@/lib/companies'
import { COUNTRIES } from '@/lib/countries'
import { GUIDES } from '@/lib/guides'
import { INTENTS } from '@/lib/intents'
import { siteUrl } from '@/lib/site'

// Cache 10 minutes — the founder hits this manually or via uptime checks,
// so we don't need real-time freshness.
export const revalidate = 600

/**
 * Lightweight SEO health snapshot.
 *
 * GET /api/seo-status returns aggregate counts for everything we expect to be
 * in the sitemap. The founder can:
 *  - hit it manually to confirm crawl surface size before a launch,
 *  - point an uptime monitor at it (alert if `roleCount` drops dramatically),
 *  - diff numbers against Search Console's "Indexed pages" once verified.
 *
 * Intentionally bare — no auth, no PII, only public counts and the canonical
 * sitemap URL. Solo-founder-grade observability.
 */
export async function GET() {
  const [jobs, companies] = await Promise.all([
    getJobs({ limit: 5000 }),
    getCompanies(500),
  ])

  const base = siteUrl()
  const now = new Date().toISOString()

  // Freshness buckets — now uses posted_at (real provider date) per refresh engine, not created_at
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const last7d = jobs.filter((j) => new Date(j.posted_at).getTime() >= sevenDaysAgo).length
  const last30d = jobs.filter((j) => new Date(j.posted_at).getTime() >= thirtyDaysAgo).length

  // Stale counts — these are excluded from the sitemap and noindexed at the
  // role level, but tracking them surfaces if the ingest pipeline has stalled.
  const expired = jobs.filter(
    (j) => j.expires_at && new Date(j.expires_at).getTime() < Date.now(),
  ).length
  const olderThan90d = jobs.filter(
    (j) => new Date(j.posted_at).getTime() < ninetyDaysAgo,
  ).length
  const indexableRoles = jobs.length - expired - olderThan90d

  // Open-to-Africa is the strategic SEO moat — call it out separately so
  // the founder watches the moat depth grow week over week.
  const openToAfrica = jobs.filter((j) => j.is_open_to_africa).length

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
        roles: jobs.length,
        rolesIndexable: indexableRoles,
        rolesOpenToAfrica: openToAfrica,
        companies: companies.length,
        countries: COUNTRIES.length,
        guides: GUIDES.length,
        intents: INTENTS.length,
      },
      freshness: {
        rolesLast7d: last7d,
        rolesLast30d: last30d,
        rolesExpired: expired,
        rolesOlderThan90d: olderThan90d,
      },
      sample: {
        // First few canonical URLs of each kind — useful for visually
        // confirming the sitemap is producing the URLs you expect.
        intents: INTENTS.slice(0, 3).map((i) => `${base}/remote-jobs/search/${i.slug}`),
        countries: COUNTRIES.slice(0, 3).map((c) => `${base}/remote-jobs/${c.slug}`),
        roles: jobs.slice(0, 3).map((j) => `${base}/role/${j.slug}`),
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
  )
}
