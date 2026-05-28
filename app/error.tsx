'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { humanizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { AlertTriangle } from 'lucide-react'

/**
 * Per-route error boundary. Must be a self-contained client component — it
 * cannot transitively import server-only modules (like SiteShell -> Navbar ->
 * lib/supabase/server), so we render a minimal branded shell directly.
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
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Nexa home"
      >
        <Logo className="h-5 w-5" />
        <span className="font-medium tracking-tight text-foreground">Nexa</span>
      </Link>
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
      {error?.digest && (
        <p className="mt-6 text-[11px] tracking-wide text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
    </main>
  )
}
