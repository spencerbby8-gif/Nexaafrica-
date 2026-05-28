import Link from 'next/link'
import { INTENTS } from '@/lib/intents'

/**
 * Search-intent rail. Renders pill-shaped links to the high-intent
 * landing pages so crawlers (and users) can discover them from the
 * main /jobs hub and other listing surfaces.
 *
 * Tone is calm — no badges, no "hot" callouts. Just clean signposts.
 */
export function IntentRail({ exclude }: { exclude?: string }) {
  const items = INTENTS.filter((i) => i.slug !== exclude)
  if (items.length === 0) return null
  return (
    <nav aria-label="High-intent searches" className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Browse by intent
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li key={i.slug}>
            <Link
              href={`/remote-jobs/search/${i.slug}`}
              className="inline-flex rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {i.shortLabel}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
