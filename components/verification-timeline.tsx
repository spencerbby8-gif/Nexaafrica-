import { Globe, ShieldCheck, Clock, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'
import type { Job } from '@/lib/types'
import { relativeTime } from '@/lib/format'
import { pipelineState } from '@/lib/ai/pipelineState'

/**
 * Verification Timeline — shows the verification journey of a job listing:
 * when it was ingested, when AI verified it, and when the source page was
 * last checked for liveness. Makes freshness visible and honest.
 *
 * [2026-08-13 audit F2] The AI step previously derived from model_version
 * alone and ignored the queue row — every no-AI job rendered "Pending
 * verification — In queue for AI analysis" even when processing had already
 * finished (rejected / failed / rule-based). Now the step derives from the
 * canonical pipelineState so labels always match the stored queue state.
 */
export function VerificationTimeline({
  job,
  intelligence,
  queueStatus,
  queueError,
}: {
  job: Job
  intelligence?: JobAIIntelligenceRow | null
  queueStatus?: string | null
  queueError?: string | null
}) {
  const steps: Array<{
    icon: typeof Globe
    label: string
    time: string | null
    detail: string
    done: boolean
    tone: 'positive' | 'neutral' | 'caution'
  }> = []

  // Step 1: Ingested
  steps.push({
    icon: FileText,
    label: 'Listed on Nexa',
    time: job.created_at,
    detail: job.source ? `Source: ${job.source}` : 'Ingested from job feed',
    done: true,
    tone: 'neutral',
  })

  // Step 2: AI verification — canonical pipeline state (queue row aware)
  const state = pipelineState({
    modelVersion: intelligence?.model_version ?? null,
    queueStatus: queueStatus ?? null,
    queueError: queueError ?? null,
  })
  const step2 = (() => {
    switch (state) {
      case 'verified':
        return { label: 'Nexa Intelligence verified', detail: `${intelligence!.evidence_provenance || 'page'} evidence`, done: true, tone: 'positive' as const }
      case 'rule_based':
        return { label: 'Rule-based intelligence', detail: 'Extracted from listing data — no live AI verdict', done: true, tone: 'neutral' as const }
      case 'rejected':
        return { label: 'Not eligible', detail: 'Role was not admitted by eligibility screening', done: true, tone: 'neutral' as const }
      case 'failed':
        return { label: 'Processing failed', detail: 'AI verification could not complete', done: true, tone: 'caution' as const }
      case 'processing':
      case 'retrying':
        return { label: 'Pending verification', detail: 'In queue for AI analysis', done: false, tone: 'caution' as const }
      case 'queued':
        return { label: 'Pending verification', detail: 'In queue for AI analysis', done: false, tone: 'caution' as const }
      default: // not_verified / no queue row
        return { label: 'Not verified', detail: 'No AI verdict yet — awaiting verification', done: false, tone: 'neutral' as const }
    }
  })()
  steps.push({
    icon: step2.done ? (state === 'verified' ? CheckCircle2 : state === 'failed' ? AlertCircle : ShieldCheck) : Clock,
    label: step2.label,
    time: intelligence?.last_verified_at || null,
    detail: step2.detail,
    done: step2.done,
    tone: step2.tone,
  })

  // Step 3: Page liveness check
  if (intelligence?.page_checked_at) {
    const status = intelligence.page_status
    steps.push({
      icon: Globe,
      label: 'Source page checked',
      time: intelligence.page_checked_at,
      detail: status === 200 ? 'Page is live' : (status != null && status >= 400) ? `Page returned ${status}` : (status != null) ? `Status ${status}` : 'Page unreachable',
      done: true,
      tone: status === 200 ? 'positive' : 'caution',
    })
  }

  if (steps.length === 0) return null

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Clock className="h-3 w-3" aria-hidden /> Verification timeline
      </h3>
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => {
          const Icon = step.icon
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  step.tone === 'positive' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                  step.tone === 'caution' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                  'border-border bg-secondary text-muted-foreground'
                }`}>
                  <Icon className="h-3 w-3" aria-hidden />
                </div>
                {i < steps.length - 1 && <div className="mt-1 h-full w-px flex-1 bg-border/40" />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm font-medium leading-snug text-foreground">{step.label}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{step.detail}</p>
                {step.time && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">{relativeTime(step.time)} ago</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
