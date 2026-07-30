import Link from 'next/link'
import { TrustBadge } from '@/components/trust-badge'
import { CompanyAvatar } from '@/components/company-avatar'
import { employmentLabel, isFresh, postedLabel, relativeTime, salaryDisplay } from '@/lib/format'
import { getJobCardExcerpt } from '@/lib/cleanDescription'
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
  const salary = salaryDisplay(job.salary_range, { openToAfrica: job.is_open_to_africa })
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
            <ProofBadge intelligence={aiIntelligence ?? (job as any)?.aiIntelligence ?? null} queueStatus={(job as any)?._queueStatus ?? null} variant="compact" />
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
          {/* Fallback: Legacy trust score display if intelligence scores not available */}
          {job.trust_score == null && (() => {
            try {
              // Unified trust: listing legitimacy (deterministic) blended with AI
              // opportunity-evidence depth. Cannot show 100 while intelligence is vague.
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
          
          {job.is_remote && <TrustBadge variant="remote" />}
          {salary.isExplicit ? (
            <TrustBadge variant="usd" label={salary.label} />
          ) : (
            <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {salary.label}
            </span>
          )}
          {job.eligibility === 'explicit' && (
            <TrustBadge variant="verified" label="Open to Africa" />
          )}
          {job.eligibility === 'likely' && (
            <TrustBadge variant="verified" label="Likely open" />
          )}
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
