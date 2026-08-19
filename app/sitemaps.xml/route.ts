import { siteUrl } from '@/lib/site'
import { jobChunkCount } from '@/lib/sitemapPolicy'
import { countIndexableJobs, SITEMAP_REVALIDATE_SECONDS } from '@/app/sitemaps/shared'

/**
 * [PHASE-3] Sitemap INDEX — /sitemaps.xml
 *
 * Replaces the old single /sitemap.xml that capped job coverage at 500 URLs.
 * Points crawlers at:
 *   /sitemaps/core      -> static pages, intents, hubs, companies, guides
 *   /sitemaps/jobs/N    -> job URLs in JOBS_PER_SITEMAP_CHUNK chunks
 *
 * Revalidates every 30 minutes so material eligibility changes (Phase 2
 * reclassifications) reach crawlers without waiting for a deployment.
 */
// export const revalidate = SITEMAP_REVALIDATE_SECONDS (bisect)

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(): Promise<Response> {
  const base = siteUrl()
  const total = await countIndexableJobs()
  const chunks = jobChunkCount(total)
  const now = new Date().toISOString()

  const locs = [`${base}/sitemaps/core`]
  for (let i = 0; i < chunks; i++) {
    locs.push(`${base}/sitemaps/jobs/${i}`)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs
  .map(
    (loc) => `  <sitemap>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`,
  )
  .join('\n')}
</sitemapindex>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, s-maxage=${SITEMAP_REVALIDATE_SECONDS}, stale-while-revalidate=${SITEMAP_REVALIDATE_SECONDS * 2}`,
    },
  })
}
