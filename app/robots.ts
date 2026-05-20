import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/profile', '/onboarding'] },
    ],
    sitemap: 'https://nexa.africa/sitemap.xml',
  }
}
