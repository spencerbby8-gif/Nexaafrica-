import Link from 'next/link'
import { Building2, Clock, Globe, MapPin, ShieldCheck } from 'lucide-react'
import { TrustBadge } from '@/components/trust-badge'
import { JobCard } from '@/components/job-card'
import { CompanyAvatar } from '@/components/company-avatar'
import { ApplyButton } from '@/components/apply-button'
import { SaveJobButton } from '@/components/save-job-button'
import { ShareSheet } from '@/components/share-sheet'
import { RoleViewTracker } from '@/components/role-view-tracker'
import { employmentLabel, isFresh, postedLabel } from '@/lib/format'
import type { Job } from '@/lib/types'

/**
 * Lightweight markdown renderer tuned for job descriptions.
 * Supports: # / ## / ### headings, unordered lists, bold (**x**),
 * italic (*x*), inline code (`x`), and links [label](url).
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = []
  // Order matters: links first, then bold, italic, code.
  const regex = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('[')) {
      const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!
      tokens.push(
        <a
          key={`${keyPrefix}-l-${i++}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground/60"
        >
          {match[1]}
        </a>,
      )
    } else if (token.startsWith('**')) {
      tokens.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-medium text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      tokens.push(
        <code
          key={`${keyPrefix}-c-${i++}`}
          className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em] text-foreground/90"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('*')) {
      tokens.push(
        <em key={`${keyPrefix}-i-${i++}`} className="italic text-foreground/90">
          {token.slice(1, -1)}
        </em>,
      )
    }
    last = regex.lastIndex
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}

function Markdown({ source }: { source: string }) {
  const blocks = source
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  return (
    <div className="space-y-6 text-[15px] leading-7 text-foreground/85 sm:text-base sm:leading-[1.75]">
      {blocks.map((block, i) => {
        if (block.startsWith('### ')) {
          return (
            <h3
              key={i}
              className="scroll-mt-20 pt-2 text-base font-semibold tracking-tight text-foreground"
            >
              {renderInline(block.replace(/^###\s+/, ''), `h3-${i}`)}
            </h3>
          )
        }
        if (block.startsWith('## ')) {
          return (
            <h2
              key={i}
              className="scroll-mt-20 border-t border-border/60 pt-6 text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
              {renderInline(block.replace(/^##\s+/, ''), `h2-${i}`)}
            </h2>
          )
        }
        if (block.startsWith('# ')) {
          return (
            <h2
              key={i}
              className="scroll-mt-20 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              {renderInline(block.replace(/^#\s+/, ''), `h1-${i}`)}
            </h2>
          )
        }
        if (/^[-*]\s+/.test(block)) {
          const items = block.split('\n').map((l) => l.replace(/^[-*]\s+/, ''))
          return (
            <ul key={i} className="space-y-2 pl-1">
              {items.map((it, j) => (
                <li
                  key={j}
                  className="relative pl-5 text-foreground/85 before:absolute before:left-0 before:top-[0.7em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent/70"
                >
                  {renderInline(it, `li-${i}-${j}`)}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-pretty">
            {renderInline(block, `p-${i}`)}
          </p>
        )
      })}
    </div>
  )
}

function countrySlug(country: string): string {
  return country.toLowerCase().replace(/\s+/g, '-')
}

export function JobDetailLayout({
  job,
  related,
  applyState = 'anon',
  isAuthed = false,
  initialSaved = false,
}: {
  job: Job
  related: Job[]
  applyState?: 'anon' | 'authed-incomplete' | 'authed-complete'
  isAuthed?: boolean
  initialSaved?: boolean
}) {
  const employment = employmentLabel(job.employment_type)
  const fresh = isFresh(job.created_at, 7)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pt-10 md:pb-16">
      <nav className="mb-4 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/jobs" className="hover:text-foreground">
          Jobs
        </Link>
        <span className="px-1.5">/</span>
        <Link
          href={`/jobs/${job.category}/worldwide`}
          className="hover:text-foreground"
        >
          {job.category}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground/80">{job.country}</span>
      </nav>

      <header className="space-y-5 border-b border-border/60 pb-8">
        <div className="flex items-start gap-4">
          <CompanyAvatar name={job.company} src={job.company_logo} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground/80">{job.company}</p>
            <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-tight">
              {job.title}
            </h1>
            {/* Realness line — quiet, factual, derived from real fields. */}
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              {fresh && (
                <span className="inline-flex items-center gap-1.5 font-medium text-accent">
                  <span
                    aria-hidden
                    className="relative inline-flex h-1.5 w-1.5"
                  >
                    <span className="absolute inset-0 rounded-full bg-accent/40" />
                    <span className="relative h-full w-full rounded-full bg-accent" />
                  </span>
                  Recently added
                </span>
              )}
              {fresh && job.is_open_to_africa && (
                <span aria-hidden className="text-muted-foreground/40">
                  {'\u00b7'}
                </span>
              )}
              {job.is_open_to_africa && (
                <span>Open to remote applicants in Africa</span>
              )}
              {(fresh || job.is_open_to_africa) && (
                <span aria-hidden className="text-muted-foreground/40">
                  {'\u00b7'}
                </span>
              )}
              <span>External application verified</span>
            </p>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {job.location ?? job.country}
          </li>
          <li className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" aria-hidden />
            {job.is_remote ? 'Remote worldwide' : 'On-site'}
          </li>
          <li className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            {employment}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {postedLabel(job.created_at)}
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-1.5">
          {job.is_remote && <TrustBadge variant="remote" />}
          {job.salary_range && <TrustBadge variant="usd" label={job.salary_range} />}
          {job.is_open_to_africa && (
            <TrustBadge variant="verified" label="Open to Africa" />
          )}
          <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/70">
            {employment}
          </span>
        </div>

        <div className="hidden md:block">
          <div className="flex items-center gap-2">
            <ApplyButton
              applyUrl={job.apply_url}
              jobId={job.id}
              jobSlug={job.slug}
              state={applyState}
              className="h-10"
            />
            <SaveJobButton
              jobId={job.id}
              jobSlug={job.slug}
              initialSaved={initialSaved}
              isAuthed={isAuthed}
              variant="pill"
              className="h-10"
            />
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-foreground/55" aria-hidden />
            Free to apply. You go directly to {job.company}. Nexa never asks for fees.
          </p>
        </div>
      </header>

      <section className="pt-8" aria-label="Role description">
        <Markdown source={job.description_md} />
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
        <h2 className="text-sm font-medium text-muted-foreground">
          About {job.company}
        </h2>
        <div className="mt-4 flex items-start gap-4">
          <CompanyAvatar name={job.company} src={job.company_logo} size={44} />
          <p className="text-[15px] leading-relaxed text-foreground/85">
            {job.company} is hiring for this role and reviews applicants directly.
            Apply through the company link. Nexa does not handle applications or
            charge fees.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/jobs/${job.category}/${countrySlug(job.country)}`}
            className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            More {job.category} roles in {job.country}
          </Link>
          <Link
            href={`/jobs/${job.category}/worldwide`}
            className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            More remote {job.category} jobs
          </Link>
          {job.is_open_to_africa && (
            <Link
              href="/jobs?africa=1"
              className="rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Roles open to African applicants
            </Link>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-10 border-t border-border/60 pt-6">
          <div className="flex items-end justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Similar roles
            </h2>
            <Link
              href={`/jobs/${job.category}/worldwide`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <JobCard key={r.id} job={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 border-t border-border/60 pt-6" aria-label="Share this role">
        <h2 className="text-sm font-medium text-muted-foreground">Share this role</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Send it to a friend who&apos;d be a great fit. The link opens with a clean preview.
        </p>
        <div className="mt-3">
          <ShareSheet
            kind="role"
            slug={job.slug}
            path={`/role/${job.slug}`}
            // WhatsApp-native multi-line share text. Plain text only, no
            // markdown, separated by line breaks because WhatsApp renders
            // them faithfully and chat skimmers scan vertically. Each line
            // is trimmed under ~50 chars to survive WhatsApp's preview crop.
            message={[
              `${job.title} — ${job.company}`,
              [
                job.is_remote ? 'Remote' : null,
                job.is_open_to_africa ? 'Open to Africa' : job.country,
                job.salary_range,
              ]
                .filter(Boolean)
                .join(' · '),
              '',
              'Verified on Nexa — direct apply, no recruiter spam.',
            ]
              .filter((l) => l !== null)
              .join('\n')}
          />
        </div>
      </section>

      <RoleViewTracker
        jobId={job.id}
        slug={job.slug}
        company={job.company}
        openToAfrica={job.is_open_to_africa}
      />

      {/* Sticky mobile apply CTA */}
      <div
        className="fixed inset-x-0 bottom-14 z-30 border-t border-border/60 bg-background/95 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur md:hidden"
        role="region"
        aria-label="Apply"
      >
        <div className="flex items-center gap-2">
          <ApplyButton
            applyUrl={job.apply_url}
            jobId={job.id}
            jobSlug={job.slug}
            state={applyState}
            className="h-11 flex-1 text-base"
            fullWidth
          >
            Apply for this role
          </ApplyButton>
          <SaveJobButton
            jobId={job.id}
            jobSlug={job.slug}
            initialSaved={initialSaved}
            isAuthed={isAuthed}
            variant="icon"
            className="h-11 w-11"
          />
        </div>
        <p className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-foreground/50" aria-hidden />
          Free to apply. You go directly to {job.company}.
        </p>
      </div>
    </div>
  )
}
