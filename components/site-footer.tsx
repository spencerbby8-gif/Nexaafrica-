import Link from 'next/link'
import { Logo } from '@/components/logo'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md text-sm text-muted-foreground">
            Remote work for African talent. Verified roles, transparent pay.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/jobs" className="hover:text-foreground">Jobs</Link>
          <Link href="/profile" className="hover:text-foreground">Profile</Link>
          <Link href="/onboarding" className="hover:text-foreground">Get started</Link>
        </nav>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} Nexa</span>
          <span className="font-mono">v0.1</span>
        </div>
      </div>
    </footer>
  )
}
