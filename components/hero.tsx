import Link from 'next/link'
import { Search } from 'lucide-react'
import { TrustStrip } from '@/components/trust-strip'
import type { Category } from '@/lib/types'

export function Hero({
  categories,
  jobCount,
}: {
  categories: Category[]
  jobCount?: number
}) {
  return (
    <section className="relative">
      <div className="mx-auto max-w-4xl px-4 pb-10 pt-12 sm:px-6 sm:pb-14 sm:pt-20">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Remote work, made legible
        </p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-[56px] md:leading-[1.05]">
          Real remote jobs for African talent.
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Nexa lists reviewed remote roles from companies that hire globally. No
          fake listings, no recruiter spam, no fees to apply.
        </p>

        <form
          action="/jobs"
          className="mt-8 flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card p-1.5 focus-within:border-foreground/30"
          role="search"
        >
          <label htmlFor="q" className="sr-only">
            Search roles
          </label>
          <Search className="ml-2 h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            id="q"
            name="q"
            type="search"
            inputMode="search"
            placeholder="Search roles, companies, skills"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Search
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {categories.slice(0, 6).map((c) => (
            <Link
              key={c.slug}
              href={`/jobs/${c.slug}/worldwide`}
              className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {c.title}
            </Link>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          <TrustStrip />
          {typeof jobCount === 'number' && jobCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-1.5 w-1.5 rounded-full bg-accent"
                aria-hidden
              />
              {jobCount} active role{jobCount === 1 ? '' : 's'} this week
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
