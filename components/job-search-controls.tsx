'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Visible search bar + quick-filter chips for the jobs index.
 *
 * Previously the page read `?q=` but nothing in the UI ever set it — search
 * was unreachable. This restores text search and surfaces the three highest-
 * intent toggles (Open to Africa, Remote, USD-paying) as one-tap chips so the
 * core positioning pillars are discoverable without opening the filter sheet.
 *
 * All state lives in the URL (shareable, crawlable, back-button safe). The
 * advanced filter sheet still owns category + employment type.
 */
export function JobSearchControls() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [term, setTerm] = useState(searchParams.get('q') ?? '')

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const submitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      pushParams((p) => {
        const v = term.trim()
        if (v) p.set('q', v)
        else p.delete('q')
      })
    },
    [pushParams, term],
  )

  const clearSearch = useCallback(() => {
    setTerm('')
    pushParams((p) => p.delete('q'))
  }, [pushParams])

  const toggle = useCallback(
    (key: string) => {
      pushParams((p) => {
        if (p.get(key) === '1') p.delete(key)
        else p.set(key, '1')
      })
    },
    [pushParams],
  )

  const chips: { key: string; label: string }[] = [
    { key: 'africa', label: 'Open to Africa' },
    { key: 'remote', label: 'Remote only' },
    { key: 'usd', label: 'USD-paying' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submitSearch} role="search" className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search role or company…"
          aria-label="Search roles by title or company"
          className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-20 text-sm outline-none transition-colors focus:border-foreground/30"
        />
        {term && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-[4.25rem] top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick filters">
        {chips.map((chip) => {
          const active = searchParams.get(chip.key) === '1'
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(chip.key)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border/70 bg-secondary text-foreground/80 hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
