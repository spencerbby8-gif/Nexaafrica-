'use client'

import { useState } from 'react'
import { Sparkles, Smartphone, Copy, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const SAMPLE_PROMPT =
  'Create a clean professional one-page resume PDF for a customer support specialist. Use globally professional formatting, plain typography, and avoid graphics or color blocks. Include: a short factual summary, work experience with concise bullet points (most recent first), skills, and education. No personal details like date of birth, marital status, NIN, or photograph.'

/**
 * Onboarding helper card.
 *
 * Surfaces two real-world traps before they break the upload:
 *   1. Cloud-preview PDFs (Google Drive on Android) — these often arrive as
 *      0-byte handles that fail to parse. Tell the user to download first.
 *   2. Some users don't have a CV at all — give them a working AI prompt
 *      they can paste into Gemini/ChatGPT/Google Docs.
 *
 * Tone: calm, helpful, restrained. Hidden behind a single chevron so it
 * never dominates the upload box.
 */
export function CvUploadGuidance() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Silent: copying is a convenience, not a critical path.
    }
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-foreground/85">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          Tips before uploading
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 px-4 py-4">
          {/* Android / Google Drive preview-PDF warning. This is the single
              biggest cause of "Failed to fetch"-style upload errors we see. */}
          <div className="flex items-start gap-2.5">
            <Smartphone
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="text-foreground">For best results,</span> upload
              PDFs saved directly on your device. Cloud-preview files (Google
              Drive on Android, iCloud previews) sometimes don&apos;t upload
              correctly. Download the file first, then upload that copy.
            </p>
          </div>

          {/* No-CV path — give users a real, working prompt they can paste. */}
          <div className="flex items-start gap-2.5">
            <Sparkles
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                <span className="text-foreground">Don&apos;t have a CV yet?</span>{' '}
                Generate one in Gemini, ChatGPT, or Google Docs and export as
                PDF. You can use this prompt as a starting point:
              </p>
              <div className="mt-2 rounded-md border border-border/70 bg-muted/40 p-3">
                <p className="text-[12.5px] leading-relaxed text-foreground/85">
                  &ldquo;{SAMPLE_PROMPT}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-accent" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden />
                      Copy prompt
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
