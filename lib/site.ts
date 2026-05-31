/**
 * Centralised, DETERMINISTIC site URL resolver.
 *
 * SEO correctness (canonical tags, sitemap <loc>, robots Host/Sitemap lines)
 * requires that every generated absolute URL uses ONE fixed host — the exact
 * host of the verified Google Search Console property. If the host varies by
 * which Vercel alias served the request, Google rejects the sitemap with
 * "Sitemap could not be read" (cross-host URLs) or "Couldn't fetch".
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_SITE_URL  — explicit override. Set this (and nothing else
 *     needs to change in code) when migrating to a custom domain such as
 *     https://nexa.africa.
 *  2. CANONICAL_SITE_URL    — the hard-pinned production host. This is the
 *     verified Search Console property and the only host we advertise to
 *     crawlers.
 *
 * We intentionally DO NOT fall back to VERCEL_PROJECT_PRODUCTION_URL or
 * VERCEL_URL: those resolve to whichever alias served the request, which is
 * exactly what made the sitemap host non-deterministic. Preview deployments
 * therefore canonicalise to production, which is the desired SEO behaviour.
 *
 * Always returns a string with protocol and no trailing slash.
 */
export const CANONICAL_SITE_URL = 'https://v0-nexaafrica.vercel.app'

function resolveBase(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || CANONICAL_SITE_URL
  // Guard against a misconfigured env var (missing protocol / trailing slash).
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/+$/, '')
}

export function siteUrl(path: string = ''): string {
  const base = resolveBase()
  if (!path) return base
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

/**
 * Returns the bare hostname (no protocol) suitable for share-card
 * footers, OG image branding, and the robots.txt Host directive.
 */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host
  } catch {
    return new URL(CANONICAL_SITE_URL).host
  }
}
