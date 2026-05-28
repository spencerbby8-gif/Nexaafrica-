/**
 * Centralised site URL resolver.
 *
 * Resolves in this order:
 *  1. NEXT_PUBLIC_SITE_URL (explicit override — used for nexa.africa once
 *     the custom domain ships)
 *  2. VERCEL_PROJECT_PRODUCTION_URL (Vercel-injected, production deployments)
 *  3. VERCEL_URL (Vercel-injected, preview deployments)
 *  4. https://nexa.africa (final fallback for local builds and crawls)
 *
 * Always returns a string with protocol and no trailing slash. Use
 * `siteUrl()` for runtime URL building (canonicals, OG image URLs,
 * sitemap entries, share links). Domain migration becomes a one-env-var
 * change — no code edits.
 */
export function siteUrl(path: string = ''): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://nexa.africa'

  const base = raw.replace(/\/+$/, '')
  if (!path) return base
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

/**
 * Returns the bare hostname (no protocol) suitable for share-card
 * footers and OG image branding.
 */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host
  } catch {
    return 'nexa.africa'
  }
}
