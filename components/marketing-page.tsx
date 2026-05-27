import type { ReactNode } from 'react'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'

/**
 * Shared layout for institutional pages (about, privacy, terms, etc.).
 * Calm, editorial, recruiter-grade — not a marketing landing.
 */
export function MarketingPage({
  eyebrow,
  title,
  lede,
  updated,
  children,
}: {
  eyebrow?: string
  title: string
  lede?: string
  updated?: string
  children: ReactNode
}) {
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <nav
          className="text-xs text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-foreground">
            Nexa
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{title}</span>
        </nav>

        <header className="mt-5 border-b border-border/60 pb-8">
          {eyebrow ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-[34px] sm:leading-[1.15]">
            {title}
          </h1>
          {lede ? (
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {lede}
            </p>
          ) : null}
          {updated ? (
            <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              Last updated {updated}
            </p>
          ) : null}
        </header>

        <article className="prose-nexa mt-8">{children}</article>

        <footer className="mt-14 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <p>
            Questions, corrections, or scam reports?{' '}
            <Link
              href="/contact"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Contact us
            </Link>
            .
          </p>
        </footer>
      </div>
    </SiteShell>
  )
}
