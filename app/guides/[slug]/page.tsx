import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
} from '@/lib/seo'
import { GUIDES, getGuide } from '@/lib/guides'

type Params = { slug: string }

export async function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return {}
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description,
      type: 'article',
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt ?? guide.publishedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.title,
      description: guide.description,
    },
  }
}

export default async function GuidePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) notFound()

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Nexa', url: '/' },
    { name: 'Guides', url: '/guides' },
    { name: guide.title, url: `/guides/${guide.slug}` },
  ])
  const article = articleJsonLd({
    title: guide.title,
    description: guide.description,
    url: `/guides/${guide.slug}`,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
  })
  const faq = guide.faq && guide.faq.length > 0 ? faqJsonLd(guide.faq) : null

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(article) }}
      />
      {faq ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(faq) }}
        />
      ) : null}

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Nexa</Link>
          <span className="px-1.5">/</span>
          <Link href="/guides" className="hover:text-foreground">Guides</Link>
          <span className="px-1.5">/</span>
          <span className="text-foreground/80">{guide.title}</span>
        </nav>

        <header className="mt-5 border-b border-border/60 pb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Nexa &middot; Guide
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-[34px] sm:leading-[1.15]">
            {guide.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {guide.lede}
          </p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
            {guide.readMinutes} min read &middot; Updated{' '}
            {new Date(guide.updatedAt ?? guide.publishedAt).toLocaleDateString(
              'en-US',
              { year: 'numeric', month: 'long', day: 'numeric' },
            )}
          </p>
        </header>

        <div className="prose-nexa mt-8">
          {guide.sections.map((section, i) => (
            <section key={i}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((p, pi) => (
                <p key={pi}>{p}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((b, bi) => (
                    <li key={bi}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          {guide.faq && guide.faq.length > 0 ? (
            <section>
              <h2>Frequently asked</h2>
              {guide.faq.map((f, i) => (
                <div key={i}>
                  <h3>{f.q}</h3>
                  <p>{f.a}</p>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        {guide.related && guide.related.length > 0 ? (
          <section className="mt-14 border-t border-border/60 pt-6">
            <h2 className="text-sm font-medium text-muted-foreground">
              Related
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {guide.related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-14 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <p>
            Browse{' '}
            <Link
              href="/jobs"
              className="text-foreground underline-offset-4 hover:underline"
            >
              all open remote roles
            </Link>{' '}
            or{' '}
            <Link
              href="/onboarding"
              className="text-foreground underline-offset-4 hover:underline"
            >
              transform your CV
            </Link>{' '}
            for global remote hiring.
          </p>
        </footer>
      </article>
    </SiteShell>
  )
}
