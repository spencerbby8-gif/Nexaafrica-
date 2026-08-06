import { ShieldCheck, Globe, Banknote, Building2, Wrench, GraduationCap, Clock } from 'lucide-react'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'
import type { Job } from '@/lib/types'
import { pipelineState } from '@/lib/ai/pipelineState'
import { plainifyPosting, traceableQuote } from '@/lib/evidence'
import { asSkillList } from '@/lib/ai/normalize'
import { salaryDisplay } from '@/lib/format'

interface Props {
  intelligence: JobAIIntelligenceRow | null | undefined
  job?: Job | null
  matchReasons?: string[]
  userSkills?: string[]
  variant?: 'card' | 'detail'
}


function intelligenceState(row: any | null | undefined, queueStatus?: string | null, queueError?: string | null): { status: "pending"|"complete"|"degraded"|"failed"; label: string; tone: string } {
  // [V3] Derive from the canonical pipeline state — one truthful mapping.
  const st = pipelineState({ modelVersion: row?.model_version, queueStatus, queueError })
  switch (st) {
    case "verified":
      return { status: "complete", label: "Nexa Intelligence", tone: "accent" }
    case "rule_based":
      return { status: "degraded", label: "Rule-based", tone: "amber" }
    case "failed":
      return { status: "failed", label: "Failed", tone: "red" }
    case "processing":
      return { status: "pending", label: "Processing", tone: "amber" }
    case "retrying":
      return { status: "pending", label: "Retrying", tone: "amber" }
    case "queued":
      return { status: "pending", label: "Queued", tone: "amber" }
    case "rejected":
      return { status: "pending", label: "Not eligible", tone: "neutral" }
    case "not_verified":
      return { status: "pending", label: "Not verified", tone: "neutral" }
    default:
      return { status: "pending", label: "Pending", tone: "amber" }
  }
}
function africaFitLabel(elig: string | null | undefined, fallbackElig?: string | null): { label: string; tone: 'positive' | 'caution' | 'neutral' } {
  // [ARCHITECTURE — single-owner doctrine] Displays the CANONICAL stored
  // verdict — the Nexa Intelligence verdict first — with its provenance
  // class. The render layer never re-decides eligibility: a stale stored
  // verdict is healed by re-verification/backfill, never masked here.
  if (elig) {
    switch (elig) {
      case 'explicit':
        return { label: 'Explicitly open to Africa', tone: 'positive' }
      case 'likely':
        return { label: 'Likely open to Africa', tone: 'caution' }
      case 'restricted':
        return { label: 'Restricted – may require US/EU residency', tone: 'caution' }
      case 'unknown':
        return { label: 'Africa eligibility unknown', tone: 'neutral' }
      default:
        return { label: 'Intelligence pending', tone: 'neutral' }
    }
  }
  // [TRUTH LAYER v1] Ingest-tier fallback (queued/rule-based rows with no AI
  // verdict) is a heuristic read, not a verified claim. P0-4: unknown/likely
  // must never assert affirmative Africa openness — render as unverified.
  // 'restricted' stays shown (protective); 'explicit' requires Africa
  // actually named in the posting at ingest and matches the card chip.
  switch (fallbackElig) {
    case 'explicit':
      return { label: 'Open to Africa', tone: 'positive' }
    case 'likely':
      return { label: 'Likely open · unverified', tone: 'neutral' }
    case 'restricted':
      return { label: 'Restricted – may require US/EU residency', tone: 'caution' }
    case 'unknown':
      return { label: 'Africa eligibility unknown', tone: 'neutral' }
    default:
      return { label: 'Intelligence pending', tone: 'neutral' }
  }
}

function remoteLabel(elig: string | null | undefined, isRemote?: boolean | null, evidence?: string | null) {
  // P6: metadata-sourced truth gets an honest provenance marker.
  const metadataTag = ' (from feed)' // signals the claim comes from ATS metadata, not page verification
  if (elig) {
    switch (elig) {
      case 'fully_remote':
        // If the only evidence is the ATS metadata marker, label it honestly
        if (evidence?.startsWith('Marked as remote in source feed')) return 'Fully remote' + metadataTag
        return 'Fully remote'
      case 'hybrid':
        return 'Hybrid – some onsite'
      case 'onsite':
        return 'On-site'
      default:
        return 'Remote policy unknown'
    }
  }
  if (isRemote) return 'Fully remote (from feed)'
  return 'Remote policy unknown'
}

function salaryTruthLabel(row: JobAIIntelligenceRow | null | undefined, job?: Job | null) {
  // [V1.2] Feed fallbacks inherit the SAME junk guard as the chip: a stored
  // "USD0.03k - USD0.1k" range is data corruption, and rendering it verbatim
  // while the chip stays silent is a same-card contradiction (live on
  // Autodesk/Video Editor cards, 2026-08-05).
  let feedRange: string | null = null
  if (job?.salary_range) {
    try {
      const sd = salaryDisplay(job.salary_range, { openToAfrica: job.is_open_to_africa })
      if (sd.isExplicit) feedRange = job.salary_range
    } catch {}
  }
  if (row) {
    const trans = row.salary_transparency
    const isEst = row.salary_is_estimated
    const hasRange = row.salary_min != null || row.salary_max != null
    const currency = row.salary_currency || job?.salary_currency || ''
    const min = row.salary_min ?? job?.salary_min
    const max = row.salary_max ?? job?.salary_max
    const period = row.salary_period ?? null
    // [V1.2] Salary hygiene at render — junk never wears a "disclosed" label:
    //   · "USD 0 – 0" asserting disclosure (live: BI Consultant card) is a
    //     contradiction; zero/negative ranges are not compensation evidence.
    //   · k-collapsed tiny "yearly" ranges ("USD 0.03 – 0.1" — live on three
    //     micro1 cards) are data corruption, not pay — surface the quality
    //     issue honestly instead of quoting nonsense with a confidence score.
    const nmin = typeof min === 'number' ? min : null
    const nmax = typeof max === 'number' ? max : null
    const zeroRange = (nmax != null && nmax <= 0) && (nmin == null || nmin <= 0)
    const kCollapsed = nmax != null && nmax > 0 && nmax < 500 && (period == null || period === 'year') && (currency === '' || currency === 'USD')
    if (trans === 'disclosed' && (zeroRange || kCollapsed)) {
      return { label: 'Salary unclear', detail: "Raw value failed quality checks — we don't display it as compensation.", hasSalary: false, junk: true }
    }
    if (trans === 'disclosed' && (hasRange || min != null || max != null)) {
      const suffix = period === 'hour' ? '/hour' : period === 'day' ? '/day' : period === 'month' ? '/month' : period === 'year' ? '/year' : ''
      const fmt = (n: number | null) => n == null ? null : (n % 1 !== 0 ? n.toFixed(2).replace(/\.?0+$/, '') : `${n}`)
      const range = nmin != null && nmax != null ? `${currency} ${fmt(nmin)} – ${fmt(nmax)}${suffix}` : nmin != null ? `${currency} ${fmt(nmin)}${suffix}` : nmax != null ? `${currency} ${fmt(nmax)}${suffix}` : `${currency} disclosed`
      return { label: `Salary disclosed: ${range}`, detail: isEst ? 'Estimated from posting' : 'Quoted from posting', hasSalary: true }
    }
    if (trans === 'estimated') {
      return { label: `Salary estimated`, detail: min || max ? `${currency} ${min ?? ''} – ${max ?? ''} (estimated)` : 'Based on market data', hasSalary: true }
    }
    if (trans === 'undisclosed') {
      if (feedRange) {
        return { label: `Salary disclosed: ${feedRange}`, detail: 'From job feed (AI says undisclosed)', hasSalary: true }
      }
      return { label: 'Salary not disclosed', detail: 'No salary in posting', hasSalary: false }
    }
  }
  if (feedRange) {
    return { label: `Salary disclosed: ${feedRange}`, detail: 'From job feed, AI pending', hasSalary: true }
  }
  if (!row) return { label: 'Salary intelligence pending', detail: job ? 'No salary in original feed' : '', hasSalary: false }
  return { label: 'Salary not disclosed', detail: 'No salary in posting', hasSalary: false }
}

function companyLabel(legit: string | null | undefined, hasLogo?: boolean | null) {
  if (legit && legit !== 'unknown') {
    switch (legit) {
      case 'verified':
        return { label: 'Company verified', tone: 'positive' as const }
      case 'likely_legit':
        return { label: 'Likely legitimate', tone: 'caution' as const }
      case 'suspicious':
        return { label: 'Needs verification', tone: 'caution' as const }
      default:
        return { label: legit, tone: 'neutral' as const }
    }
  }
  return { label: 'Company legitimacy unknown', tone: 'neutral' as const }
}

function expLabel(level: string | null | undefined, title?: string | null) {
  if (level && level !== 'unknown') {
    switch (level) {
      case 'entry': return 'Entry level'
      case 'mid': return 'Mid level'
      case 'senior': return 'Senior level'
      case 'executive': return 'Executive level'
      default: return level
    }
  }
  if (title) {
    if (/senior|staff|lead|principal/i.test(title)) return 'Senior level (from title)'
    if (/junior|entry|intern/i.test(title)) return 'Entry level (from title)'
    return 'Mid level (from title)'
  }
  return 'Experience unknown'
}

function EvidenceQuote({ text, url, allowLink = true, plain }: { text?: string | null; url?: string | null; allowLink?: boolean; plain?: string | null }) {
  if (!text) return null
  // [EVIDENCE V1.2] No quote renders untested: it must be traceable,
  // word-aligned, to the posting's plain rendering. This kills stored
  // markdown fragments ("…app/companies/x) provides…"), mid-word slices
  // ("ues to ensure…", "…United Stat"), and escaped-garbage "quotes"
  // ("\\*\\*NOTE…") across every surface at once.
  if (plain == null) return null
  const cleaned = traceableQuote(text, plain)
  if (!cleaned) return null
  return (
    <blockquote className="mt-1.5 break-words border-l-2 border-border pl-2.5 text-[11.5px] italic leading-relaxed text-foreground/70">
      “{cleaned}”
      {url && allowLink && (
        <>
          {' '}
          <a href={url} target="_blank" rel="noreferrer" className="not-italic underline decoration-border underline-offset-2 hover:decoration-foreground/60">
            source
          </a>
        </>
      )}
      {url && !allowLink && (
        <>
          {' '}
          <span className="not-italic text-[10px] text-muted-foreground/60">source verified</span>
        </>
      )}
    </blockquote>
  )
}

// Compact version for job cards (Home feed under "Matching your experience")
export function OpportunityIntelligenceSummary({ intelligence, job, matchReasons }: Props) {
  // Always show something, even when AI missing, using job fallbacks
  const hasAI = !!intelligence
  const state = intelligenceState(intelligence, (job as any)?._queueStatus, (job as any)?._queueError)
  const degraded = hasAI && state.status === 'degraded' // regex/legacy fallback rows — not real AI output
  const plain = job ? plainifyPosting(`${job.description_md ?? ''}\n${job.location ?? ''}`) : null
  const africa = africaFitLabel(intelligence?.africa_eligibility, job?.eligibility)
  const remote = remoteLabel(intelligence?.remote_eligibility, job?.is_remote, intelligence?.remote_evidence)
  const salary = salaryTruthLabel(intelligence, job || null)
  const company = companyLabel(intelligence?.company_legitimacy, job?.company_logo ? true : false)
  const exp = expLabel(intelligence?.experience_level, job?.title)
  const overall = intelligence?.overall_confidence ?? (hasAI ? 0 : 0)
  const isHigh = overall >= 70
  // [V1.2] Deduped at render (kills stored "Finance, Finance"); never JSON.
  const requiredSkills = asSkillList(intelligence?.required_skills ?? job?.tags ?? []).slice(0, 3)
  // [ARCHITECTURE] The stored confidence pairs with the stored verdict it
  // belongs to — one canonical pair, displayed with its provenance class.
  const africaConf = intelligence?.africa_confidence

  if (!hasAI || degraded) {
    const badgeColor = state.status === 'failed' ? 'border-red-500/20 bg-red-500/10 text-red-600' : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
    const msg = state.status === 'failed' ? 'Intelligence unavailable — processing failed' : state.label === 'Not verified' ? 'No verified intelligence for this listing' : degraded ? 'AI verification pending — showing feed data only' : 'Intelligence pending — our verifier is checking this role'
    return (
      <div className="mt-2.5 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            Opportunity Intelligence
          </p>
          <span className={'rounded-full border px-1.5 py-0.5 text-[9px] ' + badgeColor}>{state.label}</span>
        </div>
        <ul className="mt-2 grid gap-1.5 text-[11px] leading-snug">
          <li className="flex gap-1.5"><Globe className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{africa.label}</span></li>
          <li className="flex gap-1.5"><Clock className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{remote}</span></li>
          <li className="flex gap-1.5"><Banknote className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{salary.label}</span></li>
          <li className="flex gap-1.5"><Building2 className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{company.label}</span></li>
          <li className="flex gap-1.5"><GraduationCap className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{exp} {requiredSkills.length ? `• ${requiredSkills.join(', ')}` : ''}</span></li>
        </ul>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className={'h-1.5 w-1.5 rounded-full ' + (state.status === 'pending' ? 'animate-pulse bg-amber-500' : 'bg-red-400')} aria-hidden />
          {msg}
        </p>
        {matchReasons && matchReasons.length > 0 && (
          <p className="mt-1.5 rounded bg-accent/10 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/90">
            <span className="font-medium text-accent">Why this matches you:</span> {matchReasons.join(' · ')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2.5 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
          Opportunity Intelligence
        </p>
        <span className={`text-[10px] ${isHigh ? 'text-accent' : 'text-muted-foreground'}`}>{state.status === 'degraded' ? 'Degraded • ' : ''}
          {overall}% confidence • {intelligence.last_verified_at ? new Date(intelligence.last_verified_at).toLocaleDateString() : 'recently verified'}
        </span>
      </div>
      <ul className="mt-2 grid gap-1.5 text-[11px] leading-snug">
        <li className="flex gap-1.5"><Globe className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className={africa.tone === 'positive' ? 'text-foreground font-medium' : 'text-muted-foreground'}>{africa.label}{africaConf ? ` • ${africaConf}%` : ''}</span></li>
        <li className="flex gap-1.5"><Clock className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{remote}{intelligence.timezone_requirements ? ` • ${intelligence.timezone_requirements}` : ''}{intelligence.remote_confidence ? ` • ${intelligence.remote_confidence}%` : ''}</span></li>
        <li className="flex gap-1.5"><Banknote className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{salary.label}{salary.hasSalary && salary.label.startsWith('Salary disclosed') && intelligence.salary_confidence ? ` • ${intelligence.salary_confidence}%` : ''}</span></li>
        <li className="flex gap-1.5"><Building2 className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className={company.tone === 'positive' ? 'text-foreground' : 'text-muted-foreground'}>{company.label}{intelligence.company_confidence ? ` • ${intelligence.company_confidence}%` : ''}</span></li>
        <li className="flex gap-1.5"><GraduationCap className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">{exp}{requiredSkills.length > 0 ? ` • Skills: ${requiredSkills.join(', ')}` : ''}</span></li>
      </ul>
      {matchReasons && matchReasons.length > 0 && (
        <p className="mt-2.5 rounded bg-accent/10 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/90">
          <span className="font-medium text-accent">Why this matches you:</span> {matchReasons.join(' · ')}
        </p>
      )}
      {(() => {
        // [EVIDENCE PLANE RESTORE 2026-08-06] Display the first DISPLAY-SAFE
        // stored quote — never a bare "Evidence" heading, and never let one
        // malformed stored quote (e.g. a mid-word africa_evidence slice) hide
        // a traceable stored quote sitting beside it in the same row. When
        // nothing stored is safely displayable, the block renders nothing;
        // the pipeline-state badge above already says verification is pending
        // or degraded. Selection is display-safety only — no recompute, never
        // a substitute sentence.
        const candidates = [intelligence.africa_evidence, intelligence.remote_evidence, intelligence.salary_evidence]
        const firstTraceable = plain != null ? (candidates.find((t) => t && traceableQuote(t, plain)) ?? null) : null
        if (!firstTraceable) return null
        return (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Evidence</p>
            <EvidenceQuote text={firstTraceable} url={intelligence.africa_source_urls?.[0] || intelligence.evidence_urls?.[0]} allowLink={false} plain={plain} />
          </div>
        )
      })()}
    </div>
  )
}

// Full detail version for role pages
export function OpportunityIntelligencePanel({ intelligence, job, matchReasons }: Props) {
  if (!intelligence && !job) {
    return (
      <section aria-label="Opportunity Intelligence" className="rounded-lg border border-border/70 bg-secondary/30 px-4 py-4 sm:px-5">
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden />Opportunity Intelligence</h2>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">Pending</span>
        </header>
        <p className="mt-3 flex items-center gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden />Our verifier is checking this role.
        </p>
      </section>
    )
  }

  const hasAI = !!intelligence
  const plain = job ? plainifyPosting(`${job.description_md ?? ''}\n${job.location ?? ''}`) : null
  const africa = africaFitLabel(intelligence?.africa_eligibility, job?.eligibility)
  const salary = salaryTruthLabel(intelligence, job || null)
  const company = companyLabel(intelligence?.company_legitimacy, job?.company_logo ? true : false)
  const overallConf = intelligence?.overall_confidence ?? 0

  return (
    <section aria-label="Opportunity Intelligence" className="rounded-lg border border-border/70 bg-card px-4 py-5 sm:px-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden />Opportunity Intelligence</h2>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${overallConf >= 70 ? 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300' : overallConf >= 40 ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-secondary text-muted-foreground'}`}>
            {(hasAI && overallConf > 0) ? `${overallConf}% overall confidence` : 'Pending – using feed fallback'}
          </span>
          {intelligence?.last_verified_at && <span className="text-[11px] text-muted-foreground">Verified {new Date(intelligence.last_verified_at).toLocaleDateString()}</span>}
        </div>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Globe className="h-3 w-3" aria-hidden /> Africa Fit</p>
          <p className={`mt-1.5 text-sm font-medium ${africa.tone === 'positive' ? 'text-foreground' : africa.tone === 'caution' && (intelligence?.africa_eligibility === 'restricted' || job?.eligibility === 'restricted') ? 'text-amber-700 dark:text-amber-400' : 'text-foreground/80'}`}>{africa.label}</p>
          {intelligence?.africa_confidence != null && <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.africa_confidence}% confidence</p>}
          {intelligence?.country_restrictions && intelligence.country_restrictions.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Restrictions: {intelligence.country_restrictions.join(', ')}</p>}
          {intelligence?.visa_sponsorship && intelligence.visa_sponsorship !== 'unknown' && <p className="mt-1 text-[11px] text-muted-foreground">Visa: {intelligence.visa_sponsorship.replace('_', ' ')}</p>}
          <EvidenceQuote text={intelligence?.africa_evidence} url={intelligence?.africa_source_urls?.[0]} plain={plain} />
          {!hasAI && job && <p className="mt-1 text-[11px] text-muted-foreground">Inferred from the feed — not yet verified by Nexa Intelligence.</p>}
        </div>

        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Clock className="h-3 w-3" aria-hidden /> Remote Policy</p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{remoteLabel(intelligence?.remote_eligibility, job?.is_remote, intelligence?.remote_evidence)}</p>
          {intelligence?.timezone_requirements && <p className="mt-1 text-[11px] text-muted-foreground">Timezone: {intelligence.timezone_requirements}</p>}
          {intelligence?.remote_confidence != null && <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.remote_confidence}% confidence</p>}
          <EvidenceQuote text={intelligence?.remote_evidence} url={intelligence?.evidence_urls?.[0]} plain={plain} />
        </div>

        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Banknote className="h-3 w-3" aria-hidden /> Salary Truthfulness</p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{salary.label}</p>
          {salary.detail && <p className="mt-1 text-[11px] text-muted-foreground">{salary.detail}</p>}
          {intelligence?.salary_currency && <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.salary_currency} {intelligence.salary_min != null ? `${intelligence.salary_min}` : ''} {intelligence.salary_max != null ? `– ${intelligence.salary_max}` : ''} {intelligence.salary_period ? `/ ${intelligence.salary_period}` : ''} {intelligence.salary_is_estimated ? '(estimated)' : ''}</p>}
          {intelligence?.salary_transparency && <p className="mt-1 text-[11px] text-muted-foreground">Transparency: {intelligence.salary_transparency}{intelligence.salary_is_estimated ? ' (estimated)' : ''}</p>}
          {intelligence?.salary_confidence != null && <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.salary_confidence}% confidence</p>}
          {!hasAI && job?.salary_range && <p className="mt-1 text-[11px] text-muted-foreground">Fallback from feed: {job.salary_range}</p>}
          <EvidenceQuote text={intelligence?.salary_evidence} url={intelligence?.evidence_urls?.[0]} plain={plain} />
        </div>

        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Building2 className="h-3 w-3" aria-hidden /> Company Legitimacy</p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{company.label}</p>
          {intelligence?.company_confidence != null && <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.company_confidence}% confidence</p>}
          {intelligence?.job_quality && <p className="mt-1 text-[11px] text-muted-foreground">Job quality: {intelligence.job_quality} {intelligence.job_quality_confidence ? `(${intelligence.job_quality_confidence}%)` : ''}</p>}
          {intelligence?.application_difficulty && <p className="mt-1 text-[11px] text-muted-foreground">Application: {intelligence.application_difficulty} • Urgency: {intelligence.hiring_urgency || 'unknown'}</p>}
          <EvidenceQuote text={intelligence?.company_evidence || intelligence?.job_quality_evidence} url={intelligence?.evidence_urls?.[0]} plain={plain} />
        </div>

        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><GraduationCap className="h-3 w-3" aria-hidden /> Experience Level</p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{expLabel(intelligence?.experience_level, job?.title)}</p>
          {intelligence?.experience_confidence != null && <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.experience_confidence}% confidence</p>}
        </div>

        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Wrench className="h-3 w-3" aria-hidden /> Skill Match</p>
          {(() => {
            const aiSkills = asSkillList(intelligence?.required_skills ?? [])
            const feedTags = aiSkills.length === 0 ? asSkillList(job?.tags ?? [], 8) : []
            const transferable = asSkillList(intelligence?.transferable_skills ?? [])
            const gaps = asSkillList(intelligence?.missing_skills ?? [])
            return (
              <>
                {aiSkills.length > 0 && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">Required: {aiSkills.join(', ')}</p>
                )}
                {aiSkills.length === 0 && feedTags.length > 0 && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">Tagged in the feed: {feedTags.join(', ')}</p>
                )}
                {aiSkills.length === 0 && feedTags.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">Required skills: unknown – no evidence in posting</p>
                )}
                {transferable.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Transferable: {transferable.join(', ')}</p>}
                {gaps.length > 0 && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Potential gaps: {gaps.join(', ')}</p>}
              </>
            )
          })()}
        </div>
      </div>

      {matchReasons && matchReasons.length > 0 && (
        <div className="mt-4 rounded-md border border-accent/20 bg-accent/10 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Why this job matches you</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{matchReasons.join(' · ')}</p>
        </div>
      )}

      <div className="mt-4 border-t border-border/60 pt-3">
        <p className="text-[11px] font-medium text-muted-foreground">Evidence & sources</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {(intelligence?.evidence_urls || []).slice(0, 5).map((u, i) => (
            <li key={i}><a href={u} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-border/60 bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Source {i + 1}</a></li>
          ))}
          {(intelligence?.africa_source_urls || []).slice(0, 3).map((u, i) => (
            <li key={`a-${i}`}><a href={u} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-border/60 bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Africa source</a></li>
          ))}
          {(!intelligence || (intelligence.evidence_urls?.length || 0) === 0) && job?.apply_url && (
            <li><a href={job.apply_url} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-border/60 bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Apply URL (fallback)</a></li>
          )}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
          Intelligence is evidence-based, stored separately from raw job data, never fabricated. When evidence is missing we show UNKNOWN or feed fallback. Verified: {intelligence?.last_verified_at ? new Date(intelligence.last_verified_at).toLocaleDateString() : 'using feed data'}
        </p>
      </div>
    </section>
  )
}
