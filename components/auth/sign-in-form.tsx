'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  next?: string | null
}

export function SignInForm({ next }: Props) {
  const params = useSearchParams()
  const nextParam = next ?? params.get('next')
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function signInWithGoogle() {
    setErrorMsg(null)
    const supabase = createClient()
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (nextParam) callbackUrl.searchParams.set('next', nextParam)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
    if (error) setErrorMsg(error.message)
  }

  function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)
    startTransition(async () => {
      const supabase = createClient()
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      if (nextParam) callbackUrl.searchParams.set('next', nextParam)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl.toString() },
      })
      if (error) {
        setStatus('error')
        setErrorMsg(error.message)
      } else {
        setStatus('sent')
      }
    })
  }

  if (status === 'sent') {
    return (
      <div className="space-y-2 rounded-lg border border-border/70 bg-card p-5 text-sm">
        <p className="font-medium text-foreground">Check your email.</p>
        <p className="text-muted-foreground">
          We sent a sign-in link to <span className="text-foreground">{email}</span>. Open it on
          this device to continue.
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
      >
        Continue with Google
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
          {pending ? 'Sending link…' : 'Send sign-in link'}
        </Button>
      </form>

      {errorMsg && (
        <p className="text-sm text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        By continuing you agree to our terms. We never share your email.
      </p>
    </div>
  )
}
