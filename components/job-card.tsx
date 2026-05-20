import Link from 'next/link'
import { TrustBadge } from '@/components/trust-badge'
import { formatSalary, relativeTime } from '@/lib/format'
import type { Job } from '@/lib/types'

export function JobCard({ job }: { job: Job }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency)

  return (
    <Link
      href={`/role/${job.slug}`}
      className="group block rounded-lg border border-border/70 bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <article className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-medium text-foreground">
              {job.title}
            </h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {job.company} · {job.location}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {relativeTime(job.postedAt)}
          </span>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{job.preview}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          {job.verified && <TrustBadge variant="verified" />}
          {job.remote && <TrustBadge variant="remote" />}
          {salary && <TrustBadge variant="usd" label={salary} />}
        </div>
      </article>
    </Link>
  )
}
