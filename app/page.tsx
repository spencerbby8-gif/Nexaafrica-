import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { Hero } from '@/components/hero'
import { JobFeed } from '@/components/job-feed'
import { HowItWorks } from '@/components/how-it-works'
import { FAQ } from '@/components/faq'
import { countJobs, getCategories, getJobs } from '@/lib/queries'

export const revalidate = 300

export default async function HomePage() {
  const [recent, categories, total] = await Promise.all([
    getJobs({ limit: 6 }),
    getCategories(),
    countJobs(),
  ])

  return (
    <SiteShell>
      <Hero categories={categories} jobCount={total} />

      <section
        className="mx-auto max-w-6xl px-4 sm:px-6"
        aria-labelledby="recent-heading"
      >
        <div className="flex items-end justify-between border-b border-border/60 pb-4">
          <div>
            <h2
              id="recent-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Recently posted
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fresh roles reviewed in the past few days.
            </p>
          </div>
          <Link
            href="/jobs"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
          </Link>
        </div>
        <div className="py-6">
          <JobFeed jobs={recent} />
        </div>
      </section>

      <div className="mt-10 sm:mt-14">
        <HowItWorks />
      </div>

      <section
        className="mx-auto mt-10 max-w-6xl px-4 sm:mt-14 sm:px-6"
        aria-labelledby="categories-heading"
      >
        <h2
          id="categories-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Browse by category
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Roles grouped by what you do.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/jobs/${c.slug}/worldwide`}
                className="block rounded-lg border border-border/70 bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 sm:mt-14">
        <FAQ />
      </div>

      <div className="h-14" />
    </SiteShell>
  )
}
