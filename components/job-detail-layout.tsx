import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TrustBadge } from '@/components/trust-badge'
import { JobCard } from '@/components/job-card'
import { relativeTime } from '@/lib/format'
import type { Job } from '@/lib/types'

function MarkdownLite({ source }: { source: string }) {
  const blocks = source
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-foreground/90">
      {blocks.map((block, i) => {
        if (block.startsWith('## ')) {
          return (
            <h2 key={i} className="text-lg font-semibold tracking-tight text-foreground">
              {block.replace(/^##\s+/, '')}
            </h2>
          )
        }
        if (block.startsWith('# ')) {
          return (
            <h2 key={i} className="text-xl font-semibold tracking-tight text-foreground">
              {block.replace(/^#\s+/, '')}
            </h2>
          )
        }
        if (block.startsWith('- ')) {
          const items = block.split('\n').map((l) => l.replace(/^-\s+/, ''))
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground/60">
              {items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block}</p>
      })}
    </div>
  )
}

const employmentLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

export function JobDetailLayout({
  job,
  related,
}: {
  job: Job
  related: Job[]
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6 md:pb-16">
      <header className="space-y-4 border-b border-border/60 pb-8">
        <div className="flex flex-wrap items-center gap-1.5">
          {job.is_remote && <TrustBadge variant="remote" />}
          {job.salary_range && <TrustBadge variant="usd" label={job.salary_range} />}
          {job.is_open_to_africa && <TrustBadge variant="verified" label="Open to Africa" />}
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {job.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {job.company} · {job.location ?? job.country} · {employmentLabels[job.employment_type] ?? job.employment_type} ·
          posted {relativeTime(job.created_at)}
        </p>
        <div className="hidden md:block">
          <Button asChild>
            <a href={job.apply_url} target="_blank" rel="noreferrer">
              Apply
            </a>
          </Button>
        </div>
      </header>

      <section className="pt-8">
        <MarkdownLite source={job.description_md} />
      </section>

      {job.tags.length > 0 && (
        <section className="mt-10 border-t border-border/60 pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Skills</h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {job.tags.map((t) => (
              <li
                key={t}
                className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-xs text-foreground/80"
              >
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 border-t border-border/60 pt-6">
        <h2 className="text-sm font-medium text-muted-foreground">About {job.company}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">
          {job.company} is hiring for this role and reviews applicants directly. Apply through the company link below.
        </p>
        <div className="mt-4">
          <Link
            href={`/jobs/${job.category}/${slugCountry(job.country)}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            More {job.category} roles in {job.country}
          </Link>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-10 border-t border-border/60 pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Related roles</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <JobCard key={r.id} job={r} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky mobile apply CTA */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border/60 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <Button asChild className="h-11 w-full text-base">
          <a href={job.apply_url} target="_blank" rel="noreferrer">
            Apply for this role
          </a>
        </Button>
      </div>
    </div>
  )
}

function slugCountry(country: string): string {
  return country.toLowerCase().replace(/\s+/g, '-')
}
