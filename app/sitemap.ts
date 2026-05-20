import type { MetadataRoute } from 'next'
import { getCategories, getJobs } from '@/lib/queries'

export const revalidate = 600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://nexa.africa'
  const now = new Date()

  const [categories, jobs] = await Promise.all([
    getCategories(),
    getJobs({ limit: 500 }),
  ])

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
    lastModified: new Date(j.created_at),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticUrls, ...categoryUrls, ...roleUrls]
}
