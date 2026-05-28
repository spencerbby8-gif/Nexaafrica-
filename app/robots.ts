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
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
