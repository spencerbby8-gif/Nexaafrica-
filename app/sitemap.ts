import type { MetadataRoute } from 'next'
import { categories, jobs } from '@/lib/data'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://nexa.africa'
  const now = new Date()

  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
  ]

  const categoryUrls: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${base}/jobs/${c.slug}/worldwide`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  const roleUrls: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${base}/role/${j.slug}`,
    lastModified: new Date(j.postedAt),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticUrls, ...categoryUrls, ...roleUrls]
}
