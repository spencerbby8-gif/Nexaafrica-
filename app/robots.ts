import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Personal/auth surfaces and API endpoints are not crawl targets.
        disallow: ['/profile', '/onboarding', '/api/', '/auth/'],
      },
    ],
    // [PHASE-3] Crawlers enter through the sitemap index (/sitemaps.xml),
    // which references the core sitemap and all job chunks.
    sitemap: [`${base}/sitemaps.xml`],
    host: base,
  }
}
