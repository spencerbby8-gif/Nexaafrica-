import Link from 'next/link'
import { TrustBadge } from '@/components/trust-badge'
import { relativeTime } from '@/lib/format'
import type { Job } from '@/lib/types'

function firstParagraph(md: string): string {
  const block = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('-'))
  if (!block) return ''
  return block.length > 180 ? block.slice(0, 180).trimEnd() + '…' : block
}

export function JobCard({ job }: { job: Job }) {
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
              {job.company} · {job.location ?? job.country}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {relativeTime(job.created_at)}
          </span>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {firstParagraph(job.description_md)}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {job.is_remote && <TrustBadge variant="remote" />}
          {job.salary_range && <TrustBadge variant="usd" label={job.salary_range} />}
          {job.is_open_to_africa && <TrustBadge variant="verified" label="Open to Africa" />}
        </div>
      </article>
    </Link>
  )
}
