/**
 * JSON-LD builders for SEO. Keep schema clean and accurate — only emit
 * fields we can vouch for. Google penalises stuffed/inaccurate structured data.
 */

const SITE = 'https://nexa.africa'

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE}${item.url}`,
    })),
  }
}

export function itemListJsonLd(
  name: string,
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url.startsWith('http') ? item.url : `${SITE}${item.url}`,
    })),
  }
}

export function faqJsonLd(
  items: { q: string; a: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }
}

export function articleJsonLd(args: {
  title: string
  description: string
  url: string
  datePublished: string
  dateModified?: string
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.title,
    description: args.description,
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': args.url.startsWith('http') ? args.url : `${SITE}${args.url}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Nexa',
      url: SITE,
    },
  }
}

export function organizationJsonLd(args: {
  name: string
  url?: string | null
  logo?: string | null
  description?: string | null
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: args.name,
    ...(args.url ? { url: args.url } : {}),
    ...(args.logo ? { logo: args.logo } : {}),
    ...(args.description ? { description: args.description } : {}),
  }
}

/**
 * Render a JSON-LD blob safely. Use in a React page like:
 *   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
 */
export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
