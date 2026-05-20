import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { categories, jobs } from '@/lib/data'

export const metadata: Metadata = {
  title: 'Remote jobs',
  description:
    'Browse verified remote roles open to African talent. Engineering, design, product, marketing and more.',
  alternates: { canonical: '/jobs' },
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = (q ?? '').trim().toLowerCase()
  const filtered = query
    ? jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(query) ||
          j.company.toLowerCase().includes(query) ||
          j.tags.some((t) => t.toLowerCase().includes(query)),
      )
    : jobs

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
              {c.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8">
          {query && (
            <p className="mb-4 text-sm text-muted-foreground">
              {filtered.length} result{filtered.length === 1 ? '' : 's'} for &ldquo;{q}&rdquo;
            </p>
          )}
          <JobFeed jobs={filtered} />
        </div>
      </div>
    </SiteShell>
  )
}
