import { ShieldCheck, Clock, Loader2, AlertCircle, Globe, FileText, Building2, Zap } from 'lucide-react'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'
import { relativeTime } from '@/lib/format'

interface ProofBadgeProps {
  intelligence?: JobAIIntelligenceRow | null
  queueStatus?: string | null
  variant?: 'compact' | 'full'
}

/**
 * Live Proof Badge — surfaces the real verification state, provider/model,
 * provenance, liveness, and confidence source. Never invents proof.
 *
 * States:
 *   verified   — real AI model produced intelligence (model_version like 'provider:model')
 *   queued     — in queue, pending or processing, no real AI yet
 *   stale      — regex-era or no-ai fallback (honest but not AI-verified)
 *   failed     — queue processing exhausted with errors
 */

function verificationState(ai: JobAIIntelligenceRow | null | undefined, qs?: string | null) {
  if (ai) {
    const mv = ai.model_version || ''
    if (mv.includes(':') && !mv.startsWith('regex') && !mv.includes('no-ai')) {
      return { status: 'verified' as const, label: 'Nexa Intelligence', tone: 'verified' }
    }
    if (mv.startsWith('regex') || mv.includes('no-ai')) {
      return { status: 'stale' as const, label: 'Rule-based', tone: 'stale' }
    }
    return { status: 'stale' as const, label: 'Unverified', tone: 'stale' }
  }
  if (qs === 'processing') return { status: 'queued' as const, label: 'Processing', tone: 'queued' }
  if (qs === 'pending') return { status: 'queued' as const, label: 'Queued', tone: 'queued' }
  if (qs === 'failed') return { status: 'failed' as const, label: 'Failed', tone: 'failed' }
  return { status: 'queued' as const, label: 'Pending', tone: 'queued' }
}

const toneStyles = {
  verified: 'border-green-500/30 bg-green-500/10 text-green-400',
  queued: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  stale: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-400',
}

const provenanceLabel: Record<string, { label: string; icon: typeof Globe }> = {
  page: { label: 'Source page', icon: Globe },
  company_page: { label: 'Company website', icon: Building2 },
  ats_metadata: { label: 'Job feed', icon: FileText },
  regex: { label: 'Rule-based', icon: Zap },
}

export function ProofBadge({ intelligence, queueStatus, variant = 'compact' }: ProofBadgeProps) {
  const state = verificationState(intelligence, queueStatus)
  const ToneClass = toneStyles[state.tone as keyof typeof toneStyles]

  const Icon = state.status === 'verified' ? ShieldCheck
    : state.status === 'queued' ? Loader2
    : state.status === 'failed' ? AlertCircle : Clock

  if (variant === 'compact') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ToneClass}`}>
        <Icon className={`h-3 w-3 ${state.status === 'queued' ? 'animate-spin' : ''}`} aria-hidden />
        {state.label}
      </span>
    )
  }

  // Full variant — detail page proof panel
  const prov = intelligence?.evidence_provenance
  const ProvInfo = prov ? provenanceLabel[prov] : null

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${state.status === 'queued' ? 'animate-spin' : ''}`} aria-hidden />
        <span className={`text-sm font-semibold ${ToneClass.split(' ').pop()}`}>{state.label}</span>
        {intelligence?.last_verified_at && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {relativeTime(intelligence.last_verified_at)}
          </span>
        )}
      </div>

      {ProvInfo && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ProvInfo.icon className="h-3 w-3" aria-hidden />
          <span>Evidence from: {ProvInfo.label}</span>
        </div>
      )}

      {intelligence?.overall_confidence != null && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/70">Confidence:</span>
          <span>{intelligence.overall_confidence}%</span>
          {intelligence.quality_score != null && (
            <span className="text-muted-foreground/60">(quality {intelligence.quality_score})</span>
          )}
        </div>
      )}

      {intelligence?.page_status != null && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/70">Page check:</span>
          <span className={
            intelligence.page_status >= 200 && intelligence.page_status < 300
              ? 'text-green-400'
              : intelligence.page_status >= 400
              ? 'text-red-400'
              : 'text-amber-400'
          }>
            {intelligence.page_status === 200 ? 'Live (200)' : intelligence.page_status >= 400 ? `Dead (${intelligence.page_status})` : `Unreachable (${intelligence.page_status || 'timeout'})`}
          </span>
        </div>
      )}

      {intelligence?.evidence_urls && intelligence.evidence_urls.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/70">Sources:</span>
          <span className="ml-1">{intelligence.evidence_urls.length} URL{intelligence.evidence_urls.length === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  )
}
