import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'
import { Compass } from 'lucide-react'

export const metadata = {
  title: 'Page not found',
  description: 'The page you were looking for is no longer available.',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
          <Compass className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="mt-6 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
          We couldn&apos;t find that page.
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          The role may have been filled, or the link is no longer active. Try
          browsing all open opportunities instead.
        </p>
        <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="sm:flex-1">
            <Link href="/jobs">Browse open roles</Link>
          </Button>
          <Button asChild variant="ghost" className="sm:flex-1">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </SiteShell>
  )
}
