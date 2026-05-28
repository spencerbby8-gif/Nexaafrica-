'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { humanizeError } from '@/lib/errors'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

/**
 * Per-route error boundary. Renders inside SiteShell so the user keeps the
 * navbar/footer for orientation and recovery is one tap away.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (error?.digest) console.log('[v0] route error digest', error.digest)
  }, [error])

  const mapped = humanizeError(error)

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="mt-6 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
          {mapped.title}
        </h1>
        {mapped.hint && (
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            {mapped.hint}
          </p>
        )}
        <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} className="sm:flex-1">
            Try again
          </Button>
          <Button asChild variant="ghost" className="sm:flex-1">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </SiteShell>
  )
}
