import Link from 'next/link'
import { Logo } from '@/components/logo'
import { ChevronDown } from 'lucide-react'

/**
 * Footer link configuration.
 *
 * Single source of truth shared by desktop and mobile renderings, so the
 * crawl graph stays identical regardless of viewport. Keeping every group
 * in one structure also lets us add/remove SEO destinations in one place.
 */
type FooterLink = { href: string; label: string }
type FooterGroup = { label: string; ariaLabel: string; links: FooterLink[] }

const GROUPS: FooterGroup[] = [
  {
    label: 'Browse',
    ariaLabel: 'Browse roles',
    links: [
      { href: '/jobs', label: 'All remote jobs' },
      { href: '/jobs/engineering/worldwide', label: 'Engineering' },
      { href: '/jobs/design/worldwide', label: 'Design' },
      { href: '/remote-jobs/search/open-to-africa', label: 'Open to Africa' },
      { href: '/remote-jobs/search/usd-paying', label: 'USD-paying' },
      { href: '/remote-jobs/search/beginner-friendly', label: 'Beginner-friendly' },
      { href: '/remote-jobs/search/ai-jobs', label: 'AI jobs' },
    ],
  },
  {
    label: 'By country',
    ariaLabel: 'Browse by country',
    links: [
      { href: '/remote-jobs/nigeria', label: 'Nigeria' },
      { href: '/remote-jobs/kenya', label: 'Kenya' },
      { href: '/remote-jobs/south-africa', label: 'South Africa' },
      { href: '/remote-jobs/ghana', label: 'Ghana' },
    ],
  },
  {
    label: 'Resources',
    ariaLabel: 'Resources',
    links: [
      { href: '/companies', label: 'Companies' },
      { href: '/guides', label: 'Guides' },
      { href: '/saved', label: 'Saved jobs' },
      { href: '/guides/cv-optimization-for-remote-jobs', label: 'CV optimization' },
      { href: '/guides/remote-salary-expectations-africa', label: 'Salary ranges' },
    ],
  },
  {
    label: 'Company',
    ariaLabel: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/trust-and-safety', label: 'Trust & safety' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/60 md:mt-20">
      {/* ── Desktop: original 5-column grid for crawl-rich layout. */}
      <div className="mx-auto hidden max-w-6xl gap-10 px-6 py-12 md:grid md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <BrandColumn />
        {GROUPS.map((group) => (
          <nav key={group.label} aria-label={group.ariaLabel} className="space-y-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-foreground/80 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* ── Mobile: compact, collapsible groups. Same links, same crawl
            graph — just denser. <details> is native, zero JS, indexable
            (links remain in the DOM whether the disclosure is open or not). */}
      <div className="px-4 py-8 md:hidden">
        <BrandColumn compact />
        <ul className="mt-6 divide-y divide-border/60 border-y border-border/60">
          {GROUPS.map((group) => (
            <li key={group.label}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-sm font-medium text-foreground/85">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 pb-4 pt-1 text-sm">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-foreground/80 hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>{'\u00a9'} {new Date().getFullYear()} Nexa</span>
          <span className="text-right">Built for African remote talent</span>
        </div>
      </div>
    </footer>
  )
}

function BrandColumn({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <Logo />
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Remote work for African talent. Reviewed roles, transparent pay,
        direct apply.
      </p>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Free to use. No fees to apply.
        </p>
      )}
    </div>
  )
}
