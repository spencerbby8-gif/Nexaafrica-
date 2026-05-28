'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { toggleSavedJob } from '@/app/actions/saved-jobs'

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
  const [isPending, startTransition] = useTransition()

  const onClick = () => {
    if (!isAuthed) {
      router.push(`/sign-in?next=${encodeURIComponent(`/role/${jobSlug}`)}`)
      return
    }
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      const res = await toggleSavedJob(jobId)
      if (!res.ok) {
        setSaved(!next)
        if (res.error === 'unauthorized') {
          router.push(`/sign-in?next=${encodeURIComponent(`/role/${jobSlug}`)}`)
        }
        return
      }
      // Server confirms truth — keep optimistic state in sync if it differs.
      if (res.saved !== next) setSaved(res.saved)
    })
  }

  const label = saved ? 'Saved' : 'Save'
  const Icon = saved ? BookmarkCheck : Bookmark

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from saved' : 'Save this role'}
        title={saved ? 'Saved' : 'Save'}
        disabled={isPending}
        className={
          'inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-card text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ' +
          (saved ? 'border-accent/40 text-accent ' : '') +
          (className ?? '')
        }
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      disabled={isPending}
      className={
        'inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ' +
        (saved ? 'border-accent/40 text-accent ' : '') +
        (className ?? '')
      }
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  )
}
