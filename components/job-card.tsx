import Link from 'next/link'
import { TrustBadge } from '@/components/trust-badge'
import { CompanyAvatar } from '@/components/company-avatar'
import { employmentLabel, isFresh, postedLabel, relativeTime, salaryDisplay } from '@/lib/format'
import { getJobCardExcerpt } from '@/lib/cleanDescription'
import { jaiSalaryDisplay, plainifyPosting } from '@/lib/evidence'
import type { Job } from '@/lib/types'
import { calculateTrustScore, unifiedTrustScore } from '@/lib/trust/engine'
import { OpportunityIntelligenceSummary } from '@/components/opportunity-intelligence'
import { IntelligenceBadge } from '@/components/intelligence-badge'
import { ProofBadge } from '@/components/proof-badge'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'

export function JobCard({
  job,
  matchReasons,
  matchScore,
  aiIntelligence,
  showOpportunityIntelligence = false,
}: {
  job: Job
  matchReasons?: string[]
  matchScore?: number
  aiIntelligence?: JobAIIntelligenceRow | null
  showOpportunityIntelligence?: boolean
}) {
  const fresh = isFresh(job.posted_at, 3)
  const baseSalary = salaryDisplay(job.salary_range, { openToAfrica: job.is_open_to_africa })
  // [EVIDENCE V1.2] A posting-verbatim salary beats a conflicting feed range
  // on every surface — same rule as the detail page (live: micro1 split).
  let jaiSalary: string | null = null
  try {
    jaiSalary = jaiSalaryDisplay(aiIntelligence as any, plainifyPosting(`${job.description_md ?? ''}\n${job.location ?? ''}`))
  } catch {}
  const salary = jaiSalary ? { ...baseSalary, label: jaiSalary, isExplicit: true } : baseSalary
  const excerpt = getJobCardExcerpt(job.description_md)
  return (
    <Link
      href={`/role/${job.slug}`}
      className="group block w-full max-w-full overflow-hidden rounded-lg border border-border/70 bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <article className="flex flex-col gap-3.5">
        <div className="flex items-start gap-3">
          <CompanyAvatar name={job.company} src={job.company_logo} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-medium leading-snug text-foreground">
              {job.title}
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {job.company} · {job.location ?? job.country}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="shrink-0 text-xs text-muted-foreground" title={postedLabel(job.posted_at)}>
              {relativeTime(job.posted_at)}
            </span>
            <ProofBadge intelligence={aiIntelligence ?? (job as any)?.aiIntelligence ?? null} queueStatus={(job as any)?._queueStatus ?? null} queueError={(job as any)?._queueError ?? null} variant="compact" />
          </div>
        </div>

        {matchReasons && matchReasons.length > 0 && !showOpportunityIntelligence && (
          <p className="-mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {matchReasons[0]}
          </p>
        )}

        {matchScore != null && showOpportunityIntelligence && (
          <div className="-mt-1 flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
              Match Score {matchScore}
            </span>
            {matchReasons && matchReasons.length > 0 && (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">{matchReasons[0]}</span>
            )}
          </div>
        )}

        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {excerpt}
        </p>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* [STABILIZATION] Unified trust ALWAYS: listing legitimacy blended
              with AI opportunity-evidence. Never shows 100 while intelligence
              is vague/unknown — the raw persisted trust_score is not shown. */}
          {(() => {
            try {
              const score = unifiedTrustScore(job as any, aiIntelligence as any)
              if (score >= 70) {
                return <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-300">Trust {score}</span>
              }
              if (score >= 40) {
                return <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-300">Trust {score}</span>
              }
              return <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">Low {score}</span>
            } catch {
              return null
            }
          })()}
          
          {(() => {
            // [TRUTH LAYER v1] Remote badge follows the verified verdict; the
            // feed flag is only a fallback. A hybrid SF role never shows a
            // bare "Remote" chip again.
            const aiRemote = (aiIntelligence as any)?.remote_eligibility
            if (aiRemote === 'hybrid') return <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Hybrid</span>
            if (aiRemote === 'onsite') return <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">On-site</span>
            if (job.is_remote) return <TrustBadge variant="remote" />
            return null
          })()}
          {salary.isExplicit ? (
            <TrustBadge variant="usd" label={salary.label} />
          ) : (
            <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {salary.label}
            </span>
          )}
          {(() => {
            // [ARCHITECTURE — single-owner doctrine] The chip displays the
            // CANONICAL stored verdict chain — Nexa Intelligence verdict
            // first, ingest tier as fallback — with its provenance class.
            // The render layer never re-decides eligibility: a stale stored
            // verdict is healed by re-verification/backfill, never masked.
            const aiElig = (aiIntelligence as any)?.africa_eligibility
            const effective = aiElig || job.eligibility
            // [REGION-LOCK] A listing the system marks as not-open-to-Africa can
            // never show an open-to-Africa badge, even when the AI found Africa
            // language — the system's own flag wins.
            if (job.is_open_to_africa === false) return null
            if (effective === 'explicit') return <TrustBadge variant="verified" label="Open to Africa" />
            // [TRUTH LAYER v1] "likely" earns the verified (green) badge ONLY
            // when the AI layer produced it. Ingest-tier 'likely' (no AI row)
            // is an informed read and renders as neutral, labeled unverified —
            // never the brand-trust green check.
            if (effective === 'likely') {
              return aiElig
                ? <TrustBadge variant="verified" label="Likely open" />
                : <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Likely open · unverified</span>
            }
            return null
          })()}
          {employmentLabel(job.employment_type) && (
            <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/70">
              {employmentLabel(job.employment_type)}
            </span>
          )}
          {fresh && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              New
            </span>
          )}
        </div>

        {/* Opportunity Intelligence – real fix for Home feed, uses same cleaned AI path, fallback to job when AI missing */}
        {showOpportunityIntelligence && (
          <div className="mt-1">
            <OpportunityIntelligenceSummary intelligence={aiIntelligence} job={job} matchReasons={matchReasons} />
          </div>
        )}
      </article>
    </Link>
  )
}
