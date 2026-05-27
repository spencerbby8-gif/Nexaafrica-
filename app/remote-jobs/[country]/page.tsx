import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { TrustStrip } from '@/components/trust-strip'
import { FAQ } from '@/components/faq'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdString } from '@/lib/seo'
import { COUNTRIES, getCountry } from '@/lib/countries'
import { getCategories, getJobs, countJobs } from '@/lib/queries'

export const revalidate = 600

type Params = { country: string }

export async function generateStaticParams() {
  return COUNTRIES.map((c) => ({ country: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { country } = await params
  const c = getCountry(country)
  if (!c) return {}
  const title = c.slug === 'worldwide'
    ? 'Remote jobs hiring worldwide'
    : `Remote jobs hiring in ${c.name}`
  const description = c.intro
  return {
    title,
    description,
    alternates: { canonical: `/remote-jobs/${c.slug}` },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function CountryHubPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { country } = await params
  const c = getCountry(country)
  if (!c) notFound()

  const filter = c.slug === 'worldwide'
    ? { openToAfrica: false, limit: 60 }
    : c.isAfrican
      ? { openToAfrica: true, limit: 60 }
      : { country: c.name, limit: 60 }

  const [jobs, total, categories] = await Promise.all([
    getJobs(filter),
    countJobs(filter),
    getCategories(),
  ])

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Nexa', url: '/' },
    { name: 'Remote jobs', url: '/jobs' },
    { name: c.name, url: `/remote-jobs/${c.slug}` },
  ])

  const itemList = itemListJsonLd(
    `Remote jobs in ${c.name}`,
    jobs.slice(0, 20).map((j) => ({
      name: `${j.title} at ${j.company}`,
      url: `/role/${j.slug}`,
    })),
  )

  const heroTitle = c.slug === 'worldwide'
    ? 'Remote jobs hiring worldwide'
    : `Remote jobs hiring in ${c.name}`

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

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Nexa</Link>
          <span className="px-1.5">/</span>
          <Link href="/jobs" className="hover:text-foreground">Remote jobs</Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{c.name}</span>
        </nav>

        <header className="mt-4 max-w-2xl">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {heroTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {total > 0 ? (
              <>
                {total} active remote {total === 1 ? 'role' : 'roles'} on Nexa.{' '}
                {c.intro}
              </>
            ) : (
              c.intro
            )}
          </p>
        </header>

        <div className="mt-5">
          <TrustStrip />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Open roles
          </h2>
          <div className="mt-3">
            <JobFeed jobs={jobs} />
          </div>
        </section>

        <section className="mt-12 border-t border-border/60 pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            Browse by category in {c.name}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <li key={cat.slug}>
                <Link
                  href={`/jobs/${cat.slug}/${c.slug}`}
                  className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  Remote {cat.title.toLowerCase()} jobs in {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 border-t border-border/60 pt-8">
          <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
            Hiring reality in {c.name}
          </h2>
          <div className="mt-4 max-w-3xl space-y-4 text-[15px] leading-relaxed text-muted-foreground">
            <p>{c.hiringNote}</p>
            <p>
              Every role on Nexa is reviewed before it goes live. Closed and
              expired listings are removed automatically. Applying is always
              free — Nexa never charges candidates and does not partner with
              recruiters who do.
            </p>
          </div>
        </section>

        <section className="mt-12 border-t border-border/60 pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            Other countries hiring remote
          </h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {COUNTRIES.filter((other) => other.slug !== c.slug).map((other) => (
              <li key={other.slug}>
                <Link
                  href={`/remote-jobs/${other.slug}`}
                  className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 border-t border-border/60 pt-10">
          <FAQ />
        </div>

        <div className="h-14" />
      </div>
    </SiteShell>
  )
}
