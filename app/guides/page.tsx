import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdString } from '@/lib/seo'
import { GUIDES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Remote work guides for African talent',
  description:
    'Practical guides on remote work, CV optimization, interview prep, and salary expectations — written for candidates from Africa.',
  alternates: { canonical: '/guides' },
  openGraph: {
    title: 'Remote work guides for African talent',
    description:
      'Practical guides on remote work, CV optimization, interview prep, and salary expectations — written for candidates from Africa.',
    type: 'website',
  },
}

export default function GuidesIndexPage() {
  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Nexa', url: '/' },
    { name: 'Guides', url: '/guides' },
  ])
  const itemList = itemListJsonLd(
    'Nexa guides',
    GUIDES.map((g) => ({ name: g.title, url: `/guides/${g.slug}` })),
  )

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Nexa</Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">Guides</span>
        </nav>

        <header className="mt-5 border-b border-border/60 pb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Nexa &middot; Guides
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-[34px] sm:leading-[1.15]">
            Remote work guides for African talent
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Practical, specific writing for candidates breaking into global
            remote work from across the continent. No fluff. No filler.
          </p>
        </header>

        <ul className="mt-8 divide-y divide-border/60">
          {GUIDES.map((g) => (
            <li key={g.slug} className="py-5">
              <Link
                href={`/guides/${g.slug}`}
                className="group block"
              >
                <h2 className="text-balance text-[17px] font-medium leading-snug text-foreground group-hover:underline group-hover:underline-offset-4">
                  {g.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {g.description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {g.readMinutes} min read
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <div className="h-10" />
      </div>
    </SiteShell>
  )
}
