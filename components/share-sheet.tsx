'use client'

import { useEffect, useState } from 'react'
import { Share2, Copy, Check, MessageCircle } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

type ShareKind = 'role' | 'profile' | 'company' | 'intent' | 'guide'

type Props = {
  kind: ShareKind
  slug: string
  /** Path on the site (e.g. `/role/abc-xyz`) — will be made absolute. */
  path: string
  /** Pre-formatted message body; receivers see this in WhatsApp/X composers. */
  message: string
  className?: string
}

/**
 * Lightweight share affordance.
 *
 * Why three buttons (and one fallback)?
 *  - WhatsApp is the dominant share surface in Africa — direct deep link.
 *  - X / Twitter still drives a meaningful chunk of recruiter shares.
 *  - Copy-link is the universal fallback for LinkedIn, Slack, iMessage, etc.
 *  - On mobile devices that support `navigator.share` we surface a "More"
 *    action that opens the OS share sheet (better UX on iOS/Android).
 *
 * Privacy: we track `share_click` with channel + slug. No PII, no message body.
 */
export function ShareSheet({ kind, slug, path, message, className }: Props) {
  const [copied, setCopied] = useState(false)
  const [hasNativeShare, setHasNativeShare] = useState(false)

  useEffect(() => {
    setHasNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const url = siteUrl(path)
  const waText = encodeURIComponent(`${message}\n\n${url}`)
  const xText = encodeURIComponent(message)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      track({ name: 'share_click', props: { kind, channel: 'copy', slug } })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        track({ name: 'share_click', props: { kind, channel: 'copy', slug } })
        setTimeout(() => setCopied(false), 1800)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  const onNative = async () => {
    try {
      await navigator.share({ title: 'Nexa', text: message, url })
      track({ name: 'share_click', props: { kind, channel: 'native', slug } })
    } catch {
      // user cancelled — silent
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        className,
      )}
      role="group"
      aria-label="Share this"
    >
      <a
        href={`https://wa.me/?text=${waText}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track({ name: 'share_click', props: { kind, channel: 'whatsapp', slug } })}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        WhatsApp
      </a>

      <a
        href={`https://twitter.com/intent/tweet?text=${xText}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track({ name: 'share_click', props: { kind, channel: 'twitter', slug } })}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Share on X"
      >
        <span aria-hidden className="font-semibold">X</span>
      </a>

      <button
        type="button"
        onClick={onCopy}
        aria-live="polite"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy link
          </>
        )}
      </button>

      {hasNativeShare && (
        <button
          type="button"
          onClick={onNative}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
          aria-label="More share options"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          More
        </button>
      )}
    </div>
  )
}
