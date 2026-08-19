import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { CompanyAvatar } from '@/components/company-avatar'
import { JobFeed } from '@/components/job-feed'
import { TrustStrip } from '@/components/trust-strip'
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  jsonLdString,
  organizationJsonLd,
} from '@/lib/seo'
import { getCompanyBySlug } from '@/lib/companies'
import { getCategories } from '@/lib/queries'
import { ogImage } from '@/lib/og'

export const revalidate = 600

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const result = await getCompanyBySlug(slug)
  // [404-INTEGRITY] notFound at metadata time keeps the 404 head clean.
  if (!result) notFound()
  const { company } = result
  const title = `${company.name} — open remote roles`
  const description = `${company.jobCount} open remote ${
    company.jobCount === 1 ? 'role' : 'roles'
  } at ${company.name}. Direct apply on the company&apos;s site. Reviewed by Nexa.`
  const ogUrl = ogImage({
    kind: 'company',
    title: company.name,
    subtitle: `${company.jobCount} open remote ${company.jobCount === 1 ? 'role' : 'roles'}`,
    meta: 'Reviewed by Nexa',
  })
  return {
    title,
    description,
    alternates: { canonical: `/companies/${slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogUrl, width: 1200, height: 630, alt: company.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  }
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const result = await getCompanyBySlug(slug)
  if (!result) notFound()
  const { company, jobs } = result
  const allCategories = await getCategories()
  const categoryTitleBySlug = new Map(allCategories.map((c) => [c.slug, c.title]))

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Nexa', url: '/' },
    { name: 'Companies', url: '/companies' },
    { name: company.name, url: `/companies/${slug}` },
  ])
  const org = organizationJsonLd({
    name: company.name,
    logo: company.logo,
  })
  const itemList = itemListJsonLd(
    `Open roles at ${company.name}`,
    jobs.slice(0, 20).map((j) => ({
      name: j.title,
      url: `/role/${j.slug}`,
    })),
  )

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(org) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }}
      />

      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-10">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Nexa</Link>
          <span className="px-1.5">/</span>
          <Link href="/companies" className="hover:text-foreground">Companies</Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{company.name}</span>
        </nav>

        <header className="mt-4 flex items-start gap-4">
          <CompanyAvatar name={company.name} src={company.logo} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              {company.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {company.jobCount} open remote{' '}
              {company.jobCount === 1 ? 'role' : 'roles'} on Nexa
              {company.africaFriendlyCount > 0
                ? `, ${company.africaFriendlyCount} open to applicants in Africa.`
                : '.'}{' '}
              Direct apply on {company.name}&apos;s own site. Nexa never
              handles applications and never charges candidates.
            </p>
          </div>
        </header>

        <div className="mt-5">
          <TrustStrip />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Open at {company.name}
          </h2>
          <div className="mt-3">
            <JobFeed jobs={jobs} />
          </div>
        </section>

        {company.categories.length > 1 && (
          <section className="mt-12 border-t border-border/60 pt-6">
            <h2 className="text-sm font-medium text-muted-foreground">
              Categories at {company.name}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {company.categories.map((cat) => (
                <li key={cat}>
                  <Link
                    href={`/jobs/${cat}/worldwide`}
                    className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    Remote {(categoryTitleBySlug.get(cat) ?? cat).toLowerCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 border-t border-border/60 pt-8">
          <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
            About hiring at {company.name}
          </h2>
          <div className="mt-4 max-w-3xl space-y-4 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              Listings on this page are pulled directly from {company.name}
              &apos;s public application pages. Each role is reviewed before it
              goes live, and removed automatically when the role closes.
            </p>
            <p>
              You apply on {company.name}&apos;s own site. Nexa never collects
              applications or fees. If a role on this page looks suspicious,{' '}
              <Link
                href="/contact"
                className="text-foreground underline-offset-4 hover:underline"
              >
                tell us
              </Link>
              .
            </p>
          </div>
        </section>

        <div className="h-14" />
      </div>
    </SiteShell>
  )
}
