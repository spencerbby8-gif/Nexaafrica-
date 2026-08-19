import { jobChunkEntries, urlsetXml, sitemapResponse, SITEMAP_REVALIDATE_SECONDS } from '@/app/sitemaps/shared'
import { jobChunkCount } from '@/lib/sitemapPolicy'
import { countIndexableJobs } from '@/app/sitemaps/shared'

/**
 * [PHASE-3] Job sitemap chunk — /sitemaps/jobs/[chunk]
 * Only legitimate, active, publicly accessible jobs (Phase 2/3 contract):
 * explicit/likely eligibility, open to Africa, remote per evidence, no
 * duplicates, fresh, not expired, never AI-restricted.
 */
// export const revalidate = SITEMAP_REVALIDATE_SECONDS (bisect)

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ chunk: string }> },
): Promise<Response> {
  const { chunk } = await ctx.params
  const index = Number(chunk)

  // Never serve out-of-range chunks (crawlers hitting stale index entries).
  if (!Number.isInteger(index) || index < 0) {
    return new Response('Not Found', { status: 404 })
  }
  const total = await countIndexableJobs()
  if (index >= jobChunkCount(total)) {
    return new Response('Not Found', { status: 404 })
  }

  return sitemapResponse(urlsetXml(await jobChunkEntries(index)))
}

