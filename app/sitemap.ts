import type { MetadataRoute } from 'next'
import { getCategories, getJobs } from '@/lib/queries'
import { getCompanies } from '@/lib/companies'
import { COUNTRIES } from '@/lib/countries'
import { GUIDES } from '@/lib/guides'
import { INTENTS } from '@/lib/intents'
import { siteUrl } from '@/lib/site'

export const revalidate = 600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const now = new Date()

  const [categories, jobs, companies] = await Promise.all([
    getCategories(),
    getJobs({ limit: 500 }),
    getCompanies(200),
  ])

  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/companies`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/guides`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/trust-and-safety`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Country hubs: /remote-jobs/[country]
  const countryUrls: MetadataRoute.Sitemap = COUNTRIES.map((c) => ({
    url: `${base}/remote-jobs/${c.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: c.isAfrican ? 0.85 : 0.7,
  }))

  // Programmatic category × country combinations.
  // Worldwide for every category, plus African countries for richer surface area.
  const categoryCountryUrls: MetadataRoute.Sitemap = []
  for (const cat of categories) {
    for (const country of COUNTRIES) {
      categoryCountryUrls.push({
        url: `${base}/jobs/${cat.slug}/${country.slug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: country.isAfrican ? 0.7 : 0.6,
      })
    }
  }

  // Companies
  const companyUrls: MetadataRoute.Sitemap = companies.map((c) => ({
    url: `${base}/companies/${c.slug}`,
    lastModified: new Date(c.latestJobAt),
    changeFrequency: 'weekly',
    priority: 0.65,
  }))

  // Guides (authority content)
  const guideUrls: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${base}/guides/${g.slug}`,
    lastModified: new Date(g.updatedAt ?? g.publishedAt),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // Individual roles
  const roleUrls: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${base}/role/${j.slug}`,
    lastModified: new Date(j.created_at),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Search-intent landing pages
  const intentUrls: MetadataRoute.Sitemap = INTENTS.map((i) => ({
    url: `${base}/remote-jobs/search/${i.slug}`,
    lastModified: new Date(i.updatedAt),
    changeFrequency: 'daily',
    // Open-to-Africa is the strategic flagship — surface it strongly.
    priority: i.slug === 'open-to-africa' ? 0.9 : 0.75,
  }))

  return [
    ...staticUrls,
    ...intentUrls,
    ...countryUrls,
    ...categoryCountryUrls,
    ...companyUrls,
    ...guideUrls,
    ...roleUrls,
  ]
}

