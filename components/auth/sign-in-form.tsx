'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { humanizeError } from '@/lib/errors'
import { Mail } from 'lucide-react'

interface Props {
  next?: string | null
}

export function SignInForm({ next }: Props) {
  const params = useSearchParams()
  const nextParam = next ?? params.get('next')
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)

  const surfaceError = (e: unknown) => {
    const m = humanizeError(e, 'auth')
    setErrorMsg(m.title)
    setErrorHint(m.hint ?? null)
    setStatus('error')
  }

  async function signInWithGoogle() {
    setErrorMsg(null)
    setErrorHint(null)
    setGoogleLoading(true)
    const supabase = createClient()
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (nextParam) callbackUrl.searchParams.set('next', nextParam)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
    if (error) {
      setGoogleLoading(false)
      surfaceError(error)
    }
    // On success the browser navigates to Google — no need to clear loading.
  }

  function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)
    setErrorHint(null)
    startTransition(async () => {
      const supabase = createClient()
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      if (nextParam) callbackUrl.searchParams.set('next', nextParam)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl.toString() },
      })
      if (error) surfaceError(error)
      else setStatus('sent')
    })
  }

  if (status === 'sent') {
    return (
      <div className="space-y-3 rounded-lg border border-border/70 bg-card p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
          <Mail className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Check your email.</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            We sent a sign-in link to{' '}
            <span className="text-foreground">{email}</span>. Open it on{' '}
            <span className="text-foreground">this device</span> to continue. The
            link expires in 60 minutes.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t arrive? Check spam, or wait a moment and try again.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-center bg-transparent"
        onClick={signInWithGoogle}
        disabled={googleLoading}
      >
        {googleLoading ? (
          <>
            <Spinner className="mr-2 size-4" aria-hidden />
            Redirecting to Google
          </>
        ) : (
          'Continue with Google'
        )}
      </Button>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border/60" />
        or
        <span className="h-px flex-1 bg-border/60" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-2">
        <label htmlFor="email" className="text-xs text-muted-foreground">
          Email
        </label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11"
        />
        <Button type="submit" disabled={pending || !email} className="h-11 w-full">
          {pending ? (
            <>
              <Spinner className="mr-2 size-4" aria-hidden />
              Sending link
            </>
          ) : (
            'Send sign-in link'
          )}
        </Button>
      </form>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <p className="font-medium leading-tight">{errorMsg}</p>
          {errorHint && (
            <p className="mt-1 text-[13px] leading-relaxed text-destructive/85">
              {errorHint}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        By continuing you agree to our terms. We never share your email.
      </p>
    </div>
  )
}
