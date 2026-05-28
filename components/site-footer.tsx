import Link from 'next/link'
import { Logo } from '@/components/logo'

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Remote work for African talent. Reviewed roles, transparent pay,
            direct apply.
          </p>
          <p className="text-xs text-muted-foreground">
            Free to use. No fees to apply.
          </p>
        </div>

        <nav aria-label="Browse roles" className="space-y-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Browse
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/jobs"
                className="text-foreground/80 hover:text-foreground"
              >
                All remote jobs
              </Link>
            </li>
            <li>
              <Link
                href="/jobs/engineering/worldwide"
                className="text-foreground/80 hover:text-foreground"
              >
                Engineering
              </Link>
            </li>
            <li>
              <Link
                href="/jobs/design/worldwide"
                className="text-foreground/80 hover:text-foreground"
              >
                Design
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/search/open-to-africa"
                className="text-foreground/80 hover:text-foreground"
              >
                Open to Africa
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/search/usd-paying"
                className="text-foreground/80 hover:text-foreground"
              >
                USD-paying
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/search/beginner-friendly"
                className="text-foreground/80 hover:text-foreground"
              >
                Beginner-friendly
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/search/ai-jobs"
                className="text-foreground/80 hover:text-foreground"
              >
                AI jobs
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Browse by country" className="space-y-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            By country
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/remote-jobs/nigeria"
                className="text-foreground/80 hover:text-foreground"
              >
                Nigeria
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/kenya"
                className="text-foreground/80 hover:text-foreground"
              >
                Kenya
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/south-africa"
                className="text-foreground/80 hover:text-foreground"
              >
                South Africa
              </Link>
            </li>
            <li>
              <Link
                href="/remote-jobs/ghana"
                className="text-foreground/80 hover:text-foreground"
              >
                Ghana
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Resources" className="space-y-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Resources
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/companies"
                className="text-foreground/80 hover:text-foreground"
              >
                Companies
              </Link>
            </li>
            <li>
              <Link
                href="/guides"
                className="text-foreground/80 hover:text-foreground"
              >
                Guides
              </Link>
            </li>
            <li>
              <Link
                href="/saved"
                className="text-foreground/80 hover:text-foreground"
              >
                Saved jobs
              </Link>
            </li>
            <li>
              <Link
                href="/guides/cv-optimization-for-remote-jobs"
                className="text-foreground/80 hover:text-foreground"
              >
                CV optimization
              </Link>
            </li>
            <li>
              <Link
                href="/guides/remote-salary-expectations-africa"
                className="text-foreground/80 hover:text-foreground"
              >
                Salary ranges
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Company" className="space-y-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Company
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/about"
                className="text-foreground/80 hover:text-foreground"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                href="/how-it-works"
                className="text-foreground/80 hover:text-foreground"
              >
                How it works
              </Link>
            </li>
            <li>
              <Link
                href="/trust-and-safety"
                className="text-foreground/80 hover:text-foreground"
              >
                Trust &amp; safety
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="text-foreground/80 hover:text-foreground"
              >
                Contact
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="text-foreground/80 hover:text-foreground"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-foreground/80 hover:text-foreground"
              >
                Terms
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} Nexa</span>
          <span>Built for African remote talent</span>
        </div>
      </div>
    </footer>
  )
}


