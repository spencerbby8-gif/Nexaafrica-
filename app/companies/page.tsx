import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { CompanyAvatar } from '@/components/company-avatar'
import { TrustStrip } from '@/components/trust-strip'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdString } from '@/lib/seo'
import { getCompanies } from '@/lib/companies'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Companies hiring remote talent in Africa',
  description:
    'Browse companies actively hiring remote engineers, designers, and operators open to candidates across Africa. Direct apply, no fees.',
  alternates: { canonical: '/companies' },
  openGraph: {
    title: 'Companies hiring remote talent in Africa',
    description:
      'Browse companies actively hiring remote engineers, designers, and operators open to candidates across Africa.',
    type: 'website',
  },
}

export default async function CompaniesIndexPage() {
  const companies = await getCompanies(200)

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Nexa', url: '/' },
    { name: 'Companies', url: '/companies' },
  ])
  const itemList = itemListJsonLd(
    'Companies hiring remote in Africa',
    companies.slice(0, 50).map((c) => ({
      name: c.name,
      url: `/companies/${c.slug}`,
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
        dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }}
      />

      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-10">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Nexa</Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">Companies</span>
        </nav>

        <header className="mt-4 max-w-2xl">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Companies hiring remote talent
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {companies.length} companies with active reviewed roles. Each link
            takes you to that company&apos;s open positions on Nexa, with direct
            apply to their own application page.
          </p>
        </header>

        <div className="mt-5">
          <TrustStrip />
        </div>

        {companies.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">
            No companies indexed yet. Check back soon.
          </p>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {companies.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/companies/${c.slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-border/70 bg-card/50 px-4 py-3.5 transition-colors hover:border-foreground/30 hover:bg-card"
                >
                  <CompanyAvatar name={c.name} src={c.logo} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.jobCount} open {c.jobCount === 1 ? 'role' : 'roles'}
                      {c.africaFriendlyCount > 0
                        ? ` · ${c.africaFriendlyCount} open to Africa`
                        : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="h-14" />
      </div>
    </SiteShell>
  )
}
