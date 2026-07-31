import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { JobFilters } from '@/components/job-filters'
import { JobSearchControls } from '@/components/job-search-controls'
import { EmptyState } from '@/components/empty-state'
import { TrustStrip } from '@/components/trust-strip'
import { IntentRail } from '@/components/intent-rail'
import { getCategories, getJobsWithAI } from '@/lib/queries'
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
  usd?: string
  verified?: string
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  
  // Build filters object for both initial fetch and client-side pagination
  const filters = {
    q: sp.q?.trim() || undefined,
    category: sp.category || undefined,
    employmentType: (sp.employment_type as EmploymentType) || undefined,
    remoteOnly: sp.remote === '1',
    openToAfrica: sp.africa === '1',
    usdOnly: sp.usd === '1',
    verifiedOnly: sp.verified === '1',
  }
  
  // Fetch a wider window (50) so verified jobs have room to surface above
  // the newest pending jobs. Display only 20 after verified-first sort.
  const [jobs, categories] = await Promise.all([
    getJobsWithAI({
      ...filters,
      limit: 50,
    }),
    getCategories(),
  ])

  // Sort: Nexa Intelligence (AI-verified) jobs first, then by posted_at.
  const sortedAll = [...jobs].sort((a: any, b: any) => {
    const aVerified = a?.aiIntelligence?.model_version?.includes(':') && !a?.aiIntelligence?.model_version?.startsWith('regex')
    const bVerified = b?.aiIntelligence?.model_version?.includes(':') && !b?.aiIntelligence?.model_version?.startsWith('regex')
    if (aVerified && !bVerified) return -1
    if (!aVerified && bVerified) return 1
    return 0
  })
  const verifiedFiltered = filters.verifiedOnly
    ? sortedAll.filter((j: any) => {
        const mv = j?.aiIntelligence?.model_version || ''
        return mv.includes(':') && !mv.startsWith('regex')
      })
    : sortedAll
  const sortedJobs = verifiedFiltered.slice(0, 20)

  // Cursor continues from the OLDEST job in the full fetch (not the
  // displayed slice) so pagination picks up where the initial window ended.
  const initialCursor = jobs.length > 0 ? jobs[jobs.length - 1].posted_at : null

  const hasFilters = Boolean(
    sp.q || sp.category || sp.employment_type || sp.remote || sp.africa || sp.usd,
  )

  // Real, data-derived freshness signals using posted_at (real provider date) not created_at
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  const addedToday = sortedJobs.filter((j: any) => now - new Date(j.posted_at).getTime() < DAY).length
  const addedThisWeek = sortedJobs.filter(
    (j: any) => now - new Date(j.posted_at).getTime() < 7 * DAY,
  ).length

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

        <div className="mt-5">
          <JobSearchControls />
        </div>

        <div className="mt-5">
          <TrustStrip />
        </div>

        <div className="mt-6 border-t border-border/60 pt-6">
          <IntentRail />
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm text-muted-foreground">
              {jobs.length} role{jobs.length === 1 ? '' : 's'}
              {sp.q ? <> for &ldquo;{sp.q}&rdquo;</> : null}
            </p>
            {jobs.length > 0 && (addedToday > 0 || addedThisWeek > 0) && (
              <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span aria-hidden className="text-muted-foreground/40">{'\u00b7'}</span>
                {addedToday > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="relative inline-flex h-1.5 w-1.5"
                    >
                      <span className="absolute inset-0 rounded-full bg-accent/40" />
                      <span className="relative h-full w-full rounded-full bg-accent" />
                    </span>
                    {addedToday} added today
                  </span>
                ) : (
                  <span>{addedThisWeek} added this week</span>
                )}
              </p>
            )}
          </div>
          <JobFilters categories={categories} />
        </div>

        {/* Intelligence quick-filters */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/jobs?${new URLSearchParams({ ...(sp.q && { q: sp.q }), ...(sp.category && { category: sp.category }), ...(filters.verifiedOnly ? {} : { verified: '1' }) }).toString()}`}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${filters.verifiedOnly ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-border/60 text-muted-foreground hover:border-foreground/30'}`}
          >
            Nexa Intelligence only
          </Link>
        </div>

        <div className="mt-4 pb-14">
          <JobFeed
            initialJobs={sortedJobs}
            initialCursor={initialCursor}
            filters={filters}
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
