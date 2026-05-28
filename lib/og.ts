import { siteUrl } from './site'

type OgKind = 'role' | 'intent' | 'company' | 'guide' | 'profile' | 'default'

type OgArgs = {
  kind: OgKind
  title: string
  subtitle?: string
  meta?: string
  badge?: string
}

/**
 * Build a fully-qualified OG image URL for use in `metadata.openGraph.images`.
 *
 * Returns an absolute URL (including domain) so previews work correctly on
 * WhatsApp, Twitter/X, LinkedIn, iMessage, and Slack — all of which require
 * absolute image URLs and will silently drop relative ones.
 */
export function ogImage(args: OgArgs): string {
  const params = new URLSearchParams()
  params.set('kind', args.kind)
  params.set('title', args.title)
  if (args.subtitle) params.set('subtitle', args.subtitle)
  if (args.meta) params.set('meta', args.meta)
  if (args.badge) params.set('badge', args.badge)
  return siteUrl(`/api/og?${params.toString()}`)
}
