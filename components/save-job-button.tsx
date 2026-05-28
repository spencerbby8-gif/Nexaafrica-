'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { toggleSavedJob } from '@/app/actions/saved-jobs'
import { humanizeError } from '@/lib/errors'

type Props = {
  jobId: string
  jobSlug: string
  initialSaved: boolean
  isAuthed: boolean
  variant?: 'icon' | 'pill'
  className?: string
}

/**
 * Lightweight save toggle. Optimistic UI: flips immediately, reverts on error.
 * Signed-out users are sent to /sign-in with a return path that lands them
 * back on this exact role page so the action survives auth.
 *
 * Phase 8 polish:
 *  - Tactile confirmation pulse fires once on a successful save (CSS class).
 *  - Failure paths surface a calm, mapped error message inline.
 */
export function SaveJobButton({
  jobId,
  jobSlug,
  initialSaved,
  isAuthed,
  variant = 'pill',
  className,
}: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [pulse, setPulse] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (errTimer.current) clearTimeout(errTimer.current)
    }
  }, [])

  const flashError = (msg: string) => {
    setErrorMsg(msg)
    if (errTimer.current) clearTimeout(errTimer.current)
    errTimer.current = setTimeout(() => setErrorMsg(null), 3500)
  }

  const onClick = () => {
    if (!isAuthed) {
      router.push(`/sign-in?next=${encodeURIComponent(`/role/${jobSlug}`)}`)
      return
    }
    const next = !saved
    setSaved(next)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await toggleSavedJob(jobId)
      if (!res.ok) {
        setSaved(!next)
        if (res.error === 'unauthorized') {
          router.push(`/sign-in?next=${encodeURIComponent(`/role/${jobSlug}`)}`)
          return
        }
        flashError(humanizeError({ message: res.error }, 'save-job').title)
        return
      }
      // Server confirms truth — keep optimistic state in sync if it differs.
      if (res.saved !== next) setSaved(res.saved)
      // Trigger one tactile pulse on a successful save (not on un-save).
      if (res.saved) setPulse((p) => p + 1)
    })
  }

  const label = saved ? 'Saved' : 'Save'
  const Icon = saved ? BookmarkCheck : Bookmark

  if (variant === 'icon') {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          // Pulse class is keyed off the counter so it re-fires every save.
          key={`icon-${pulse}`}
          type="button"
          onClick={onClick}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save this role'}
          title={saved ? 'Saved' : 'Save'}
          disabled={isPending}
          className={
            'inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-card text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ' +
            (saved ? 'border-accent/40 text-accent ' : '') +
            (pulse > 0 ? 'nexa-pulse-once ' : '') +
            (className ?? '')
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
        {errorMsg && (
          <span role="alert" className="text-[11px] text-destructive">
            {errorMsg}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        key={`pill-${pulse}`}
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        disabled={isPending}
        className={
          'inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ' +
          (saved ? 'border-accent/40 text-accent ' : '') +
          (pulse > 0 ? 'nexa-pulse-once ' : '') +
          (className ?? '')
        }
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      {errorMsg && (
        <span role="alert" className="text-[11px] text-destructive">
          {errorMsg}
        </span>
      )}
    </span>
  )
}
