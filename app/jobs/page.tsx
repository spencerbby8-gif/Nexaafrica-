import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { JobFilters } from '@/components/job-filters'
import { getCategories, getJobs } from '@/lib/queries'
import type { EmploymentType } from '@/lib/types'

export const revalidate = 120

export const metadata: Metadata = {
  title: 'Remote jobs',
  description:
    'Browse verified remote roles open to African talent. Engineering, design, product, marketing and more.',
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

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Remote jobs</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Verified roles from companies hiring globally. Filter by category to narrow your search.
        </p>

        <nav aria-label="Categories" className="mt-6 flex flex-wrap gap-1.5">
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

        <div className="mt-4">
          <JobFeed jobs={jobs} />
        </div>
      </div>
    </SiteShell>
  )
}
