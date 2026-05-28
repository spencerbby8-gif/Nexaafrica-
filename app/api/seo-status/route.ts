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

  // Freshness buckets — stale pages dilute crawl budget. The founder sees
  // at a glance whether the inventory is healthy.
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const last7d = jobs.filter((j) => new Date(j.created_at).getTime() >= sevenDaysAgo).length
  const last30d = jobs.filter((j) => new Date(j.created_at).getTime() >= thirtyDaysAgo).length

  return NextResponse.json(
    {
      generatedAt: now,
      siteUrl: base,
      sitemap: `${base}/sitemap.xml`,
      robots: `${base}/robots.txt`,
      counts: {
        roles: jobs.length,
        companies: companies.length,
        countries: COUNTRIES.length,
        guides: GUIDES.length,
        intents: INTENTS.length,
      },
      freshness: {
        rolesLast7d: last7d,
        rolesLast30d: last30d,
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
