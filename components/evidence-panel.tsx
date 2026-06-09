import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { deriveEvidence, type EvidenceSignal } from '@/lib/evidence'
import type { Job } from '@/lib/types'

/**
 * Job Evidence Panel — Phase 15.
 *
 * Mobile-first, server-rendered (crawlable) panel that turns a listing into
 * an opportunity-intelligence summary. Every row is evidence-backed: the
 * label states the signal, the reason explains WHY Nexa is showing it, and
 * text-derived signals quote the posting verbatim. No scores, no estimates.
 */

const toneStyles: Record<
  EvidenceSignal['tone'],
  { icon: typeof CheckCircle2; iconClass: string }
> = {
  positive: { icon: CheckCircle2, iconClass: 'text-accent' },
  caution: { icon: AlertTriangle, iconClass: 'text-amber-600 dark:text-amber-500' },
  neutral: { icon: Info, iconClass: 'text-muted-foreground' },
}

const sourceLabels: Record<EvidenceSignal['source'], string> = {
  classification: 'From eligibility analysis',
  'posting-text': 'Quoted from the posting',
  'listing-metadata': "From the company's job feed",
  ingestion: "From Nexa's daily source check",
}

function EvidenceRow({ signal }: { signal: EvidenceSignal }) {
  const { icon: Icon, iconClass } = toneStyles[signal.tone]
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">
          {signal.label}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {signal.reason}
        </p>
        {signal.excerpt && (
          <blockquote className="mt-1.5 border-l-2 border-border pl-2.5 text-[12px] italic leading-relaxed text-foreground/70">
            {'\u201c'}
            {signal.excerpt}
            {'\u201d'}
          </blockquote>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {sourceLabels[signal.source]}
        </p>
      </div>
    </li>
  )
}

export function EvidencePanel({ job }: { job: Job }) {
  const signals = deriveEvidence(job)
  if (signals.length === 0) return null

  return (
    <section
      aria-label="Evidence check"
      className="rounded-lg border border-border/70 bg-secondary/40 px-4 py-4 sm:px-5"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Evidence check
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {signals.length} signal{signals.length === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="mt-1 divide-y divide-border/60">
        {signals.map((s) => (
          <EvidenceRow key={s.id} signal={s} />
        ))}
      </ul>
      <p className="mt-2 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground/80">
        Derived automatically from the posting text, the company&apos;s official
        job feed, and Nexa&apos;s ingestion checks. Nothing here is estimated,
        scored, or AI-generated. Always confirm details with the company.
      </p>
    </section>
  )
}
