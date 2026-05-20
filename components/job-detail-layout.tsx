import { Button } from '@/components/ui/button'
import { TrustBadge } from '@/components/trust-badge'
import { formatSalary, relativeTime } from '@/lib/format'
import type { Job } from '@/lib/types'

function MarkdownLite({ source }: { source: string }) {
  // Minimal markdown rendering for headings, lists, paragraphs.
  const blocks = source.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
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

export function JobDetailLayout({ job }: { job: Job }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6 md:pb-16">
      <header className="space-y-4 border-b border-border/60 pb-8">
        <div className="flex flex-wrap items-center gap-1.5">
          {job.verified && <TrustBadge variant="verified" />}
          {job.remote && <TrustBadge variant="remote" />}
          {salary && <TrustBadge variant="usd" label={salary} />}
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {job.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {job.company} · {job.location} · posted {relativeTime(job.postedAt)}
        </p>
        <div className="hidden md:block">
          <Button asChild>
            <a href={job.applyUrl ?? '#'} target="_blank" rel="noreferrer">
              Apply
            </a>
          </Button>
        </div>
      </header>

      <section className="pt-8">
        <MarkdownLite source={job.description} />
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

      {/* Sticky mobile apply CTA */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border/60 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <Button asChild className="h-11 w-full text-base">
          <a href={job.applyUrl ?? '#'} target="_blank" rel="noreferrer">
            Apply for this role
          </a>
        </Button>
      </div>
    </div>
  )
}
