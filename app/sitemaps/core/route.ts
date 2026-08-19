import { coreEntries, urlsetXml, sitemapResponse, SITEMAP_REVALIDATE_SECONDS } from '@/app/sitemaps/shared'

/**
 * [PHASE-3] Core (non-job) sitemap — /sitemaps/core
 * Static pages, search intents, country/category hubs, companies, guides.
 */
// export const revalidate = SITEMAP_REVALIDATE_SECONDS (bisect)

export async function GET(): Promise<Response> {
  return sitemapResponse(urlsetXml(await coreEntries()))
}
