import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { getCategory, getJobsByCategoryAndCountry } from '@/lib/data'

type Params = { category: string; country: string }

function titleCase(s: string) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { category, country } = await params
  const cat = getCategory(category)
  if (!cat) return {}
  const region = country === 'worldwide' ? 'Worldwide' : titleCase(country)
  const title = `${cat.label} jobs · ${region}`
  return {
    title,
    description: `Remote ${cat.label.toLowerCase()} roles open to candidates in ${region}. Verified listings only.`,
    alternates: { canonical: `/jobs/${category}/${country}` },
  }
}

export default async function CategoryCountryPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { category, country } = await params
  const cat = getCategory(category)
  if (!cat) notFound()

  const list = getJobsByCategoryAndCountry(category, country)
  const region = country === 'worldwide' ? 'Worldwide' : titleCase(country)

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {region}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {cat.label} jobs
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{cat.description}</p>

        <div className="mt-8">
          <JobFeed jobs={list} />
        </div>
      </div>
    </SiteShell>
  )
}
