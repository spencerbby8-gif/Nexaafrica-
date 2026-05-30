import Link from 'next/link'
import { TrustBadge } from '@/components/trust-badge'
import { CompanyAvatar } from '@/components/company-avatar'
import { employmentLabel, isFresh, postedLabel, relativeTime, salaryDisplay } from '@/lib/format'
import type { Job } from '@/lib/types'

function firstParagraph(md: string): string {
  const block = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('-'))
  if (!block) return ''
  return block.length > 160 ? block.slice(0, 160).trimEnd() + '…' : block
}

export function JobCard({
  job,
  matchReasons,
}: {
  job: Job
  matchReasons?: string[]
}) {
  // Freshness + posted label use the real provider posting date, not the
  // ingestion timestamp. posted_at is always populated (provider date, or
  // created_at fallback via DB trigger).
  const fresh = isFresh(job.posted_at, 3)
  const salary = salaryDisplay(job.salary_range, { openToAfrica: job.is_open_to_africa })
  return (
    <Link
      href={`/role/${job.slug}`}
      className="group block rounded-lg border border-border/70 bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
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
          <span
            className="shrink-0 text-xs text-muted-foreground"
            title={postedLabel(job.posted_at)}
          >
            {relativeTime(job.posted_at)}
          </span>
        </div>

        {matchReasons && matchReasons.length > 0 && (
          <p className="-mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {matchReasons[0]}
          </p>
        )}

        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {firstParagraph(job.description_md)}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
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
          <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/70">
            {employmentLabel(job.employment_type)}
          </span>
          {fresh && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              New
            </span>
          )}
        </div>
      </article>
    </Link>
  )
}
