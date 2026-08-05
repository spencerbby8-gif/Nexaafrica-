import { Globe, ShieldCheck, Clock, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'
import type { Job } from '@/lib/types'
import { relativeTime } from '@/lib/format'

/**
 * Verification Timeline — shows the verification journey of a job listing:
 * when it was ingested, when AI verified it, and when the source page was
 * last checked for liveness. Makes freshness visible and honest.
 */
export function VerificationTimeline({
  job,
  intelligence,
}: {
  job: Job
  intelligence?: JobAIIntelligenceRow | null
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

  // Step 2: AI Verified
  const verified = intelligence?.model_version?.includes(':') && !intelligence.model_version.startsWith('regex')
  steps.push({
    icon: ShieldCheck,
    label: verified ? 'Nexa Intelligence verified' : 'Pending verification',
    time: intelligence?.last_verified_at || null,
    detail: verified ? `${intelligence!.evidence_provenance || 'page'} evidence` : 'In queue for AI analysis',
    done: !!verified,
    tone: verified ? 'positive' : 'caution',
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
                  // relativeTime already returns the "ago" suffix — the old
                  // template produced "12h ago ago" on every timeline.
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">{relativeTime(step.time)}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
