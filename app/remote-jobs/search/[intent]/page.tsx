import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobCard } from '@/components/job-card'
import { TrustStrip } from '@/components/trust-strip'
import {
  breadcrumbJsonLd,
  faqJsonLd,
  itemListJsonLd,
  jsonLdString,
} from '@/lib/seo'
import { getIntent, listIntentSlugs } from '@/lib/intents'
import { getJobsWithAI } from '@/lib/queries'
import type { Job } from '@/lib/types'
import { ogImage } from '@/lib/og'

// Intent pages are crawl targets — keep them statically rendered with a
// short revalidate so freshness counts and titles update without hammering
// the database on every crawl.
export const revalidate = 600

type Params = { intent: string }

export async function generateStaticParams(): Promise<Params[]> {
  return listIntentSlugs().map((intent) => ({ intent }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { intent: slug } = await params
  const intent = getIntent(slug)
  if (!intent) return {}
  const url = `/remote-jobs/search/${slug}`
  const ogUrl = ogImage({
    kind: 'intent',
    title: intent.title,
    subtitle: intent.lede.slice(0, 130),
    meta: 'Live inventory \u00b7 Updated daily',
    badge: slug === 'open-to-africa' ? 'Open to Africa' : undefined,
  })
  return {
    title: intent.title,
    description: intent.description,
    alternates: { canonical: url },
    openGraph: {
      title: intent.title,
      description: intent.description,
      type: 'website',
      url,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: intent.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: intent.title,
      description: intent.description,
      images: [ogUrl],
    },
  }
}

function applyTitleKeywords(jobs: Job[], keywords?: string[]): Job[] {
  if (!keywords || keywords.length === 0) return jobs
  const norm = keywords.map((k) => k.toLowerCase())
  return jobs.filter((j) => {
    const hay = `${j.title} ${(j.tags ?? []).join(' ')}`.toLowerCase()
    return norm.some((k) => hay.includes(k))
  })
}

export default async function IntentPage({ params }: { params: Promise<Params> }) {
  const { intent: slug } = await params
  const intent = getIntent(slug)
  if (!intent) notFound()

  // Pull a wider candidate pool so keyword-narrowed intents still have
  // a healthy result set to render.
  const baseLimit = intent.titleKeywords ? 120 : intent.filters.limit ?? 24
  const candidates = await getJobsWithAI({ ...intent.filters, limit: baseLimit })
  const matched = applyTitleKeywords(candidates, intent.titleKeywords)
  // [ARCHITECTURE — single-owner doctrine] Page membership follows the
  // canonical stored flags (set at ingest / re-verification). The render
  // layer must not re-decide which jobs qualify; stale rows are healed at
  // the write path, never masked at render.
  const jobs = matched.slice(0, intent.filters.limit ?? 24)

  const url = `/remote-jobs/search/${slug}`
  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Nexa', url: '/' },
    { name: 'Remote jobs', url: '/jobs' },
    { name: intent.shortLabel, url },
  ])
  const itemList = itemListJsonLd(
    intent.title,
    jobs.slice(0, 20).map((j) => ({ name: `${j.title} — ${j.company}`, url: `/role/${j.slug}` })),
  )
  const faq = faqJsonLd(intent.faq)

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(faq) }}
      />

      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-10">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">
            Nexa
          </Link>
          <span className="px-1.5">/</span>
          <Link href="/jobs" className="hover:text-foreground">
            Remote jobs
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{intent.shortLabel}</span>
        </nav>

        <header className="mt-4 sm:mt-6">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {intent.title}
          </h1>
          <p className="mt-3 max-w-3xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            {intent.lede}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{jobs.length} active {jobs.length === 1 ? 'role' : 'roles'} indexed</span>
            <span aria-hidden>·</span>
            <span>Updated {new Date(intent.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span aria-hidden>·</span>
            <span>{"Direct apply on the company's site"}</span>
          </div>
        </header>

        <div className="mt-6">
          <TrustStrip />
        </div>

        {/* Live job rail */}
        <section className="mt-10" aria-labelledby="open-roles">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="open-roles" className="text-lg font-semibold tracking-tight">
              Open roles right now
            </h2>
            <Link
              href="/jobs"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Browse all roles
            </Link>
          </div>

          {jobs.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
              {intent.emptyMessage}
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {jobs.map((job) => (
                <li key={job.id}>
                  <JobCard job={job} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Editorial sections */}
        <article className="prose-nexa mt-12 max-w-3xl space-y-10">
          {intent.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-3 text-[15px] leading-relaxed text-foreground/85">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-4 space-y-2 text-[15px] leading-relaxed text-foreground/85">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/50" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        {/* FAQ */}
        {intent.faq.length > 0 && (
          <section className="mt-14 max-w-3xl" aria-labelledby="faq">
            <h2 id="faq" className="text-xl font-semibold tracking-tight">
              Frequently asked
            </h2>
            <dl className="mt-6 space-y-6">
              {intent.faq.map((item, i) => (
                <div key={i}>
                  <dt className="font-medium text-foreground">{item.q}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Related searches / internal links */}
        <section className="mt-14 max-w-3xl" aria-labelledby="related">
          <h2 id="related" className="text-base font-semibold tracking-tight">
            Related searches
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {intent.related.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="block rounded-md border border-border/70 bg-card px-3 py-2 text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="h-20" />
      </div>
    </SiteShell>
  )
}
