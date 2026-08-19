import Link from 'next/link'
import { Building2, Clock, Globe, MapPin, ShieldCheck } from 'lucide-react'
import { TrustBadge } from '@/components/trust-badge'
import { JobCard } from '@/components/job-card'
import { CompanyAvatar } from '@/components/company-avatar'
import { ApplyButton } from '@/components/apply-button'
import { SaveJobButton } from '@/components/save-job-button'
import { ShareSheet } from '@/components/share-sheet'
import { RoleViewTracker } from '@/components/role-view-tracker'
import { EvidencePanel } from '@/components/evidence-panel'
import { TrustCard } from '@/components/trust/trust-card'
import { ReportButton } from '@/components/trust/report-button'
import { calculateTrustScore, unifiedTrustScore, unifiedCapNote } from '@/lib/trust/engine'
import { employmentLabel, isFresh, postedLabel } from '@/lib/format'
import { cleanDescription, getCleanMarkdownForRender } from '@/lib/cleanDescription'
import type { Job } from '@/lib/types'
import { OpportunityIntelligencePanel } from '@/components/opportunity-intelligence'
import { ProofBadge } from '@/components/proof-badge'
import { VerificationTimeline } from '@/components/verification-timeline'
import { CompanyIntel } from '@/components/company-intel'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'
import type { JobWithAI } from '@/lib/ai/queries'

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
    <div className="break-words space-y-6 text-[15px] leading-7 text-foreground/85 sm:text-base sm:leading-[1.75]">
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

export function JobDetailLayout({ companyJobCount,
  job,
  related,
  applyState = 'anon',
  isAuthed = false,
  initialSaved = false,
  aiIntelligence,
  companyIntel,
  sourceIntel,
}: {
  companyJobCount?: number | null
  job: Job
  related: (Job | JobWithAI<Job>)[]
  applyState?: 'anon' | 'authed-incomplete' | 'authed-complete'
  isAuthed?: boolean
  initialSaved?: boolean
  aiIntelligence?: JobAIIntelligenceRow | null
  /** [V1-HONESTY] Live learning rows fetched fresh on the role page — the
   * trust engine consumes them so rendered signals always match the live
   * Company Intelligence panel (2026-08-12 deep audit F2/F3). */
  companyIntel?: Record<string, any> | null
  sourceIntel?: Record<string, any> | null
}) {
  const employment = employmentLabel(job.employment_type)
  // Freshness + posted label derive from the real provider posting date.
  const fresh = isFresh(job.posted_at, 7)
  // Honest, tier-aware eligibility wording. 'explicit' = confidently welcomed;
  // 'likely' = global-remote with no restriction (hedged, not a promise).
  const eligibilityLine =
    job.eligibility === 'explicit'
      ? 'Open to remote applicants in Africa'
      : job.eligibility === 'likely'
        ? 'Global remote — likely open to Africa'
        : null

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
              {fresh && eligibilityLine && (
                <span aria-hidden className="text-muted-foreground/40">
                  {'\u00b7'}
                </span>
              )}
              {eligibilityLine && <span>{eligibilityLine}</span>}
              {(fresh || eligibilityLine) && (
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
            {(() => {
              // [V4] Truthful remote display: the AI verdict (from stored
              // evidence) overrides the feed flag when they disagree — an
              // onsite role must never show as "Remote worldwide".
              const aiRemote = (aiIntelligence as any)?.remote_eligibility
              if (aiRemote === 'onsite') return 'On-site'
              if (aiRemote === 'hybrid') return 'Hybrid'
              if (aiRemote === 'fully_remote') return 'Remote worldwide'
              return job.is_remote ? 'Remote worldwide' : 'On-site'
            })()}
          </li>
          <li className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            {employment || 'Employment type not stated'}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {postedLabel(job.posted_at)}
          </li>
          {((aiIntelligence as any)?.country_restrictions?.length ?? 0) > 0 && (
            <li className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              <span>Open in: {((aiIntelligence as any).country_restrictions as string[]).join(', ')}</span>
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-1.5">
          {job.is_remote && <TrustBadge variant="remote" />}
          {job.salary_range && <TrustBadge variant="usd" label={job.salary_range} />}
          {(() => {
            const aiElig = (aiIntelligence as any)?.africa_eligibility
            const effective = aiElig || job.eligibility
            // [REGION-LOCK] Jobs the system marks as not-open-to-Africa never
            // display an open-to-Africa badge, even if AI found Africa language.
            if (job.is_open_to_africa === false) return null
            if (effective === 'explicit') return <TrustBadge variant="verified" label="Open to Africa" />
            if (effective === 'likely') return <TrustBadge variant="verified" label="Likely open to Africa" />
            return null
          })()}
          {employment && (
            <span className="rounded-md border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/70">
              {employment}
            </span>
          )}
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

      {/* Trust Intelligence Engine — core trust layer, visible, evidence-based */}
      <div className="pt-6">
        {(() => {
          // Calculate trust score on the fly if not persisted, else use persisted if available
          // For SSR, this is pure and fast (<5ms)
          try {
            // @ts-ignore - allow optional fields
            const persisted = (job as any).trust_score != null && (job as any).trust_signals?.length
              ? {
                  score: (job as any).trust_score,
                  confidence: (job as any).trust_confidence || "medium",
                  version: (job as any).trust_version || 1,
                  signals: (job as any).trust_signals,
                  isFlagged: !!(job as any).is_flagged,
                  flaggedReason: (job as any).flagged_reason,
                  isWarning: ((job as any).trust_score || 0) < 40,
                }
              : null
            // [V1-HONESTY] Trust is computed from LIVE context: the page
            // fetched companyIntel/sourceIntel fresh and counted
            // companyJobCount live, so the rendered signals always match the
            // live Company Intelligence panel. Persisted jobs.trust_signals
            // are ingest-time snapshots that contradicted the panel
            // (2026-08-12 deep audit F2: company_history 645 vs panel 659;
            // F3: the honest company_learning logic never rendered). The
            // persisted snapshot is only a fallback if live compute fails.
            let detTrust: ReturnType<typeof calculateTrustScore>
            try {
              detTrust = calculateTrustScore(job, {
                companyJobCount: companyJobCount ?? 0,
                companyIntel: (companyIntel as any) || null,
                sourceIntel: (sourceIntel as any) || null,
              })
            } catch {
              detTrust = persisted ?? calculateTrustScore(job)
            }
            // Unified: listing legitimacy blended with AI opportunity-evidence.
            const aiConf = (aiIntelligence as any)?.overall_confidence ?? null
            const trust = { ...detTrust, score: unifiedTrustScore(job, aiIntelligence as any) }
            let capNote = unifiedCapNote((aiIntelligence as any)?.africa_eligibility ?? null, (job as any).evidence_state ?? null)
            // [V1-HONESTY] No AI evidence -> say so explicitly instead of a
            // bare low score with no reason (2026-08-12 deep audit F6).
            if (!capNote && aiConf == null && trust.score < 60) {
              capNote = 'No AI evidence yet — this score reflects listing legitimacy only. Nexa Intelligence will verify the role.'
            }
            return (
              <>
                <TrustCard trust={trust as any} legitimacyScore={detTrust.score} aiConfidence={aiConf} capNote={capNote} />
                <div className="mt-4 flex justify-end">
                  <ReportButton jobId={job.id} jobSlug={job.slug} />
                </div>
              </>
            )
          } catch {
            return <EvidencePanel job={job} />
          }
        })()}
      </div>

      {/* Evidence check — secondary, kept for backward compat, now below Trust Card */}
      <div className="pt-6">
        <EvidencePanel job={job} />
      </div>

      {/* Live Proof Layer — verification state, provider/model, provenance, liveness */}
      <div className="pt-6">
        <ProofBadge intelligence={aiIntelligence || (job as any).aiIntelligence || null} queueStatus={(job as any)?._queueStatus} queueError={(job as any)?._queueError ?? null} variant="full" />
        {(() => {
          // [V1] Crawler state — surfaced truthfully (queued|fetching|fetched|
          // blocked|partial|verified|failed|stale). Only shown when set.
          const evState = (job as any).evidence_state ?? null
          if (!evState) return null
          const tone = evState === 'blocked' ? 'text-red-400' : evState === 'verified' || evState === 'fetched' ? 'text-green-400' : evState === 'failed' ? 'text-red-400' : 'text-amber-400'
          const label = evState === 'blocked' ? 'Page blocked — evidence unavailable, retrying later' : `Evidence: ${evState}`
          return (
            <div className="mt-1 text-[11px]">
              <span className="font-medium text-foreground/70">Crawler:</span>{' '}
              <span className={tone}>{label}</span>
            </div>
          )
        })()}
      </div>

      {/* Company Intelligence */}
      <div className="pt-4">
        <CompanyIntel job={job} intelligence={aiIntelligence || (job as any).aiIntelligence || null} companyJobCount={companyJobCount} />
      </div>

      {/* Verification Timeline */}
      <div className="pt-4">
        <VerificationTimeline job={job} intelligence={aiIntelligence || (job as any).aiIntelligence || null} />
      </div>

      {/* Opportunity Intelligence – full panel for detail page, evidence-backed, uses same cleaned AI path + job fallback */}
      <div className="pt-6">
        <OpportunityIntelligencePanel intelligence={aiIntelligence || (job as any).aiIntelligence || null} job={job} companyIntel={companyIntel || null} />
      </div>

      <section className="pt-8" aria-label="Role description">
        <Markdown source={getCleanMarkdownForRender(job.description_md)} />
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
            {related.map((r) => {
              const withAI = r as JobWithAI<Job>
              return (
                <JobCard
                  key={r.id}
                  job={r}
                  aiIntelligence={withAI.aiIntelligence || null}
                  showOpportunityIntelligence={false}
                />
              )
            })}
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
                (() => {
                  const aiElig = (aiIntelligence as any)?.africa_eligibility
                  const effective = aiElig || job.eligibility
                  // [REGION-LOCK] Share text must never claim open-to-Africa
                  // for listings the system marks as not open to Africa.
                  if (job.is_open_to_africa === false) return job.country
                  return effective === 'explicit' || effective === 'likely' ? 'Open to Africa' : job.country
                })(),
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
