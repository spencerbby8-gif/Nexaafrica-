'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { humanizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { AlertTriangle } from 'lucide-react'

/**
 * App-level error boundary. Replaces Next.js's default white-screen
 * "Application error" with calm, branded, recoverable copy.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface server-side digest for debugging in console only — never to user.
    if (error?.digest) console.log('[v0] error digest', error.digest)
  }, [error])

  const mapped = humanizeError(error)

  return (
    <html lang="en" className="bg-background">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
          <Logo />
          <div className="mt-10 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
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
              <Link href="/">Back to Nexa</Link>
            </Button>
          </div>
          {error?.digest && (
            <p className="mt-8 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
              Reference {error.digest.slice(0, 8)}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
