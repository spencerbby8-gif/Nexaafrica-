import Link from 'next/link'
import { Search } from 'lucide-react'
import { categories } from '@/lib/data'

export function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-4xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20 sm:pb-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Now in private beta
        </p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Remote work for African talent.
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          Nexa lists verified remote roles from companies that hire globally. No
          spam listings, no fake recruiters, no guesswork on pay.
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

        <div className="mt-6 flex flex-wrap gap-2">
          {categories.slice(0, 6).map((c) => (
            <Link
              key={c.slug}
              href={`/jobs/${c.slug}/worldwide`}
              className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
