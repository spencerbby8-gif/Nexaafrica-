import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { JobFilters } from '@/components/job-filters'
import {
  countJobs,
  getCategories,
  getCategory,
  getDistinctCountriesForCategory,
  getJobs,
} from '@/lib/queries'
import type { EmploymentType } from '@/lib/types'

export const revalidate = 600

type Params = { category: string; country: string }

function titleCase(s: string) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function regionLabel(country: string) {
  return country === 'worldwide' ? 'Worldwide' : titleCase(country)
}

function countryFilter(country: string) {
  return country === 'worldwide' ? undefined : titleCase(country)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { category, country } = await params
  const cat = await getCategory(category)
  if (!cat) return {}
  const region = regionLabel(country)
  const title = `${cat.title} jobs in ${region}`
  const description = `Remote ${cat.title.toLowerCase()} roles open to candidates in ${region}. Verified listings from companies hiring globally.`
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${category}/${country}` },
    openGraph: { title, description, type: 'website' },
  }
}

export default async function CategoryCountryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ employment_type?: string; remote?: string; africa?: string }>
}) {
  const [{ category, country }, sp] = await Promise.all([params, searchParams])
  const cat = await getCategory(category)
  if (!cat) notFound()

  const filters = {
    category,
    country: countryFilter(country),
    employmentType: (sp.employment_type as EmploymentType) || undefined,
    remoteOnly: sp.remote === '1',
    openToAfrica: sp.africa === '1',
    limit: 100,
  }

  const [jobs, total, allCategories, distinctCountries] = await Promise.all([
    getJobs(filters),
    countJobs({ category, country: countryFilter(country) }),
    getCategories(),
    getDistinctCountriesForCategory(category),
  ])

  const region = regionLabel(country)
  const relatedCategories = allCategories.filter((c) => c.slug !== category).slice(0, 6)

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/jobs" className="hover:text-foreground">
            All jobs
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{cat.title}</span>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{region}</span>
        </nav>

        <header className="mt-4 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {cat.title} jobs in {region}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {total} active {cat.title.toLowerCase()} role{total === 1 ? '' : 's'} hiring remote in {region}.
            {cat.description ? ` ${cat.description}` : null}
          </p>
        </header>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {jobs.length} of {total}
          </p>
          <JobFilters categories={allCategories} />
        </div>

        <div className="mt-4">
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-10 text-center">
              <h2 className="text-base font-medium">No active roles right now</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                New roles are posted regularly. Try a related category below or check back soon.
              </p>
            </div>
          ) : (
            <JobFeed jobs={jobs} />
          )}
        </div>

        {distinctCountries.length > 1 && (
          <section className="mt-12 border-t border-border/60 pt-6">
            <h2 className="text-sm font-medium text-muted-foreground">
              Other regions hiring {cat.title.toLowerCase()}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {distinctCountries.map((c) => {
                const slug = c.toLowerCase().replace(/\s+/g, '-')
                return (
                  <li key={c}>
                    <Link
                      href={`/jobs/${category}/${slug}`}
                      className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      {c}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="mt-10 border-t border-border/60 pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Related categories</h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {relatedCategories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/jobs/${c.slug}/${country}`}
                  className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 mb-12 border-t border-border/60 pt-6">
          <h2 className="text-base font-semibold tracking-tight">
            About {cat.title.toLowerCase()} roles on Nexa
          </h2>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>
              Nexa surfaces verified {cat.title.toLowerCase()} roles from companies that genuinely hire remote talent across {region}.
              Every listing is reviewed before it goes live.
            </p>
            <p>
              Salary ranges are shown in USD where available so you can compare offers across regions.
              Most companies on Nexa pay in USD or EUR and are open to candidates working from Africa.
            </p>
          </div>
        </section>
      </div>
    </SiteShell>
  )
}
