import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { Hero } from '@/components/hero'
import { JobFeed } from '@/components/job-feed'
import { jobs } from '@/lib/data'

export default function HomePage() {
  const recent = [...jobs]
    .sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt))
    .slice(0, 4)

  return (
    <SiteShell>
      <Hero />

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between border-b border-border/60 pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recent roles</h2>
            <p className="text-sm text-muted-foreground">
              Verified roles from companies hiring globally.
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

      <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'Verified roles',
              body: 'Every listing is reviewed before it goes live. No ghost postings.',
            },
            {
              title: 'Transparent pay',
              body: 'Salary ranges shown in USD where available, so you can compare offers.',
            },
            {
              title: 'Built for African talent',
              body: 'Optimized for mobile, low-bandwidth networks, and one-handed use.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border/70 bg-card p-5"
            >
              <h3 className="text-sm font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  )
}
