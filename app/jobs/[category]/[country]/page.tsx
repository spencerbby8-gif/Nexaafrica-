import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { JobFilters } from '@/components/job-filters'
import { EmptyState } from '@/components/empty-state'
import { TrustStrip } from '@/components/trust-strip'
import { FAQ } from '@/components/faq'
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
  const description = `Reviewed remote ${cat.title.toLowerCase()} roles open to candidates in ${region}. Direct apply, no fees.`
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${category}/${country}` },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function CategoryCountryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{
    employment_type?: string
    remote?: string
    africa?: string
  }>
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
  const relatedCategories = allCategories
    .filter((c) => c.slug !== category)
    .slice(0, 6)

  // Smart suggestions for the empty state.
  const emptySuggestions = [
    { label: `All remote ${cat.title.toLowerCase()} jobs`, href: `/jobs/${category}/worldwide` },
    { label: 'Roles open to Africa', href: '/jobs?africa=1' },
    ...relatedCategories.slice(0, 2).map((rc) => ({
      label: `Remote ${rc.title.toLowerCase()}`,
      href: `/jobs/${rc.slug}/worldwide`,
    })),
  ]

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <nav
          className="text-xs text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link href="/jobs" className="hover:text-foreground">
            All jobs
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{cat.title}</span>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{region}</span>
        </nav>

        <header className="mt-4 max-w-2xl">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {cat.title} jobs in {region}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {total > 0 ? (
              <>
                {total} active {cat.title.toLowerCase()} role
                {total === 1 ? '' : 's'} hiring remote in {region}.
              </>
            ) : (
              <>
                We&apos;re tracking {cat.title.toLowerCase()} hiring globally.
                New roles are added throughout the week.
              </>
            )}
            {cat.description ? ` ${cat.description}` : null}
          </p>
        </header>

        <div className="mt-5">
          <TrustStrip />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {jobs.length} of {total}
          </p>
          <JobFilters categories={allCategories} />
        </div>

        <div className="mt-4">
          {jobs.length === 0 ? (
            <EmptyState
              title={`No ${cat.title.toLowerCase()} roles open in ${region} right now.`}
              body="New roles are added throughout the week. Try a wider region or a related category below."
              suggestions={emptySuggestions}
            />
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
          <h2 className="text-sm font-medium text-muted-foreground">
            Related categories
          </h2>
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

        <section className="mt-12 border-t border-border/60 pt-8">
          <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
            About {cat.title.toLowerCase()} roles on Nexa
          </h2>
          <div className="mt-4 max-w-3xl space-y-4 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              Nexa surfaces reviewed {cat.title.toLowerCase()} roles from
              companies that genuinely hire remote talent across {region}. Every
              listing is checked before it goes live, and closed roles are
              removed automatically.
            </p>
            <p>
              Pay ranges are shown in USD where available, so you can compare
              offers across regions. Most companies on Nexa pay in USD or EUR
              and review applicants directly without intermediaries.
            </p>
            <p>
              You apply on the company site. Nexa never charges candidates and
              does not partner with recruiters who do.
            </p>
          </div>
        </section>

        <div className="mt-12 border-t border-border/60 pt-10">
          <FAQ />
        </div>

        <div className="h-14" />
      </div>
    </SiteShell>
  )
}
