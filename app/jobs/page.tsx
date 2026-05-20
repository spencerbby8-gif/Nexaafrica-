import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { JobFilters } from '@/components/job-filters'
import { EmptyState } from '@/components/empty-state'
import { TrustStrip } from '@/components/trust-strip'
import { getCategories, getJobs } from '@/lib/queries'
import type { EmploymentType } from '@/lib/types'

export const revalidate = 120

export const metadata: Metadata = {
  title: 'Remote jobs',
  description:
    'Reviewed remote roles open to African talent. Engineering, design, product, marketing, support and more.',
  alternates: { canonical: '/jobs' },
}

type SearchParams = {
  q?: string
  category?: string
  employment_type?: string
  remote?: string
  africa?: string
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const [jobs, categories] = await Promise.all([
    getJobs({
      q: sp.q?.trim() || undefined,
      category: sp.category || undefined,
      employmentType: (sp.employment_type as EmploymentType) || undefined,
      remoteOnly: sp.remote === '1',
      openToAfrica: sp.africa === '1',
      limit: 100,
    }),
    getCategories(),
  ])

  const hasFilters = Boolean(
    sp.q || sp.category || sp.employment_type || sp.remote || sp.africa,
  )

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Remote jobs
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Reviewed roles from companies hiring remote. Filter by category, type,
          or eligibility.
        </p>

        <div className="mt-4">
          <TrustStrip />
        </div>

        <nav
          aria-label="Categories"
          className="mt-6 flex flex-wrap gap-1.5 border-t border-border/60 pt-6"
        >
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/jobs/${c.slug}/worldwide`}
              className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {c.title}
            </Link>
          ))}
        </nav>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {jobs.length} role{jobs.length === 1 ? '' : 's'}
            {sp.q ? <> for &ldquo;{sp.q}&rdquo;</> : null}
          </p>
          <JobFilters categories={categories} />
        </div>

        <div className="mt-4 pb-14">
          <JobFeed
            jobs={jobs}
            empty={
              <EmptyState
                title={
                  hasFilters
                    ? 'No roles match these filters right now.'
                    : 'No roles are live right now.'
                }
                body={
                  hasFilters
                    ? 'Try widening your search. New roles are added throughout the week.'
                    : 'New roles are added regularly. Check back soon, or browse a category below.'
                }
                suggestions={[
                  { label: 'All remote jobs', href: '/jobs' },
                  { label: 'Open to Africa', href: '/jobs?africa=1' },
                  {
                    label: 'Remote engineering',
                    href: '/jobs/engineering/worldwide',
                  },
                  { label: 'Remote design', href: '/jobs/design/worldwide' },
                ]}
              />
            }
          />
        </div>
      </div>
    </SiteShell>
  )
}
