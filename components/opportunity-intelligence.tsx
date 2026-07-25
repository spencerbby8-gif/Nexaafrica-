import Link from 'next/link'
import { ShieldCheck, Globe, Banknote, Building2, Wrench, GraduationCap, Clock, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'

interface Props {
  intelligence: JobAIIntelligenceRow | null | undefined
  matchReasons?: string[]
  userSkills?: string[]
  variant?: 'card' | 'detail'
}

function confidenceLabel(conf: number | null | undefined): { text: string; tone: 'positive' | 'caution' | 'neutral' } {
  const c = conf ?? 0
  if (c >= 75) return { text: `${c}% confident`, tone: 'positive' }
  if (c >= 40) return { text: `${c}% confidence`, tone: 'caution' }
  return { text: c > 0 ? `${c}% • low` : 'Pending verification', tone: 'neutral' }
}

function africaFitLabel(elig: string | null | undefined): { label: string; tone: 'positive' | 'caution' | 'neutral' } {
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

function remoteLabel(elig: string | null | undefined) {
  switch (elig) {
    case 'fully_remote':
      return 'Fully remote'
    case 'hybrid':
      return 'Hybrid – some onsite'
    case 'onsite':
      return 'On-site'
    default:
      return 'Remote policy unknown'
  }
}

function salaryTruthLabel(row: JobAIIntelligenceRow | null | undefined) {
  if (!row) return { label: 'Salary intelligence pending', detail: '' }
  const trans = row.salary_transparency
  const isEst = row.salary_is_estimated
  const hasRange = row.salary_min != null || row.salary_max != null
  const currency = row.salary_currency || ''
  if (trans === 'disclosed' && hasRange) {
    const min = row.salary_min ? `${row.salary_min}` : ''
    const max = row.salary_max ? `${row.salary_max}` : ''
    const range = min && max ? `${currency} ${min} – ${max}` : min || max || `${currency} disclosed`
    return { label: `Salary disclosed: ${range}`, detail: isEst ? 'Estimated from posting' : 'Quoted from posting' }
  }
  if (trans === 'estimated') {
    return { label: `Salary estimated`, detail: row.salary_min || row.salary_max ? `${currency} ${row.salary_min ?? ''} – ${row.salary_max ?? ''} (estimated)` : 'Based on market data' }
  }
  if (trans === 'undisclosed') {
    return { label: 'Salary not disclosed', detail: 'No salary in posting' }
  }
  return { label: 'Salary intelligence pending', detail: '' }
}

function companyLabel(legit: string | null | undefined) {
  switch (legit) {
    case 'verified':
      return { label: 'Company verified', tone: 'positive' as const }
    case 'likely_legit':
      return { label: 'Likely legitimate', tone: 'caution' as const }
    case 'suspicious':
      return { label: 'Needs verification', tone: 'caution' as const }
    default:
      return { label: 'Company legitimacy unknown', tone: 'neutral' as const }
  }
}

function expLabel(level: string | null | undefined) {
  switch (level) {
    case 'entry':
      return 'Entry level'
    case 'mid':
      return 'Mid level'
    case 'senior':
      return 'Senior level'
    case 'executive':
      return 'Executive level'
    default:
      return 'Experience unknown'
  }
}

function EvidenceQuote({ text, url, allowLink = true }: { text?: string | null; url?: string | null; allowLink?: boolean }) {
  if (!text) return null
  // Clean raw evidence to avoid HTML leak – use cleanDescription style stripping
  const cleaned = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
  if (!cleaned) return null
  return (
    <blockquote className="mt-1.5 border-l-2 border-border pl-2.5 text-[11.5px] italic leading-relaxed text-foreground/70">
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
export function OpportunityIntelligenceSummary({ intelligence, matchReasons, variant = 'card' }: Props) {
  if (!intelligence) {
    return (
      <div className="mt-2.5 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
          Intelligence pending — our verifier is checking this role
        </p>
        {matchReasons && matchReasons.length > 0 && (
          <p className="mt-1 text-[11px] text-foreground/80">
            <span className="font-medium">Why this matches you:</span> {matchReasons.join(' · ')}
          </p>
        )}
      </div>
    )
  }

  const africa = africaFitLabel(intelligence.africa_eligibility)
  const remote = remoteLabel(intelligence.remote_eligibility)
  const salary = salaryTruthLabel(intelligence)
  const company = companyLabel(intelligence.company_legitimacy)
  const exp = expLabel(intelligence.experience_level)
  const overall = intelligence.overall_confidence ?? 0
  const isHigh = overall >= 70

  // Skill overlap display for card: show up to 3 required skills
  const requiredSkills = (intelligence.required_skills || []).slice(0, 4)

  return (
    <div className="mt-2.5 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
          Opportunity Intelligence
        </p>
        <span className={`text-[10px] ${isHigh ? 'text-accent' : 'text-muted-foreground'}`}>
          {overall}% confidence • {intelligence.last_verified_at ? new Date(intelligence.last_verified_at).toLocaleDateString() : 'recently verified'}
        </span>
      </div>

      <ul className="mt-2 grid gap-1.5 text-[11px] leading-snug">
        <li className="flex gap-1.5">
          <Globe className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className={africa.tone === 'positive' ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            {africa.label}
            {intelligence.africa_confidence ? ` • ${intelligence.africa_confidence}%` : ''}
          </span>
        </li>
        <li className="flex gap-1.5">
          <Clock className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            {remote}
            {intelligence.timezone_requirements ? ` • ${intelligence.timezone_requirements}` : ''}
            {intelligence.remote_confidence ? ` • ${intelligence.remote_confidence}%` : ''}
          </span>
        </li>
        <li className="flex gap-1.5">
          <Banknote className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            {salary.label}
            {intelligence.salary_confidence ? ` • ${intelligence.salary_confidence}%` : ''}
          </span>
        </li>
        <li className="flex gap-1.5">
          <Building2 className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className={company.tone === 'positive' ? 'text-foreground' : 'text-muted-foreground'}>
            {company.label}
            {intelligence.company_confidence ? ` • ${intelligence.company_confidence}%` : ''}
          </span>
        </li>
        <li className="flex gap-1.5">
          <GraduationCap className="mt-[1px] h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            {exp}
            {requiredSkills.length > 0 ? ` • Skills: ${requiredSkills.join(', ')}` : ''}
          </span>
        </li>
      </ul>

      {matchReasons && matchReasons.length > 0 && (
        <p className="mt-2.5 rounded bg-accent/10 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/90">
          <span className="font-medium text-accent">Why this matches you:</span> {matchReasons.join(' · ')}
        </p>
      )}

      {/* Evidence peek for card: show first available evidence clipped – no links inside card Link to avoid nested <a> */}
      {(intelligence.africa_evidence || intelligence.remote_evidence || intelligence.salary_evidence) && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Evidence</p>
          <EvidenceQuote text={intelligence.africa_evidence || intelligence.remote_evidence || intelligence.salary_evidence} url={intelligence.africa_source_urls?.[0] || intelligence.evidence_urls?.[0]} allowLink={false} />
        </div>
      )}
    </div>
  )
}

// Full detail version for role pages
export function OpportunityIntelligencePanel({ intelligence, matchReasons }: Props) {
  if (!intelligence) {
    return (
      <section
        aria-label="Opportunity Intelligence"
        className="rounded-lg border border-border/70 bg-secondary/30 px-4 py-4 sm:px-5"
      >
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
            Opportunity Intelligence
          </h2>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Pending
          </span>
        </header>
        <p className="mt-3 flex items-center gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
          Our verifier is checking this role. Intelligence includes Africa eligibility, salary truthfulness, remote policy, company legitimacy, skills and experience match. Check back shortly – we never guess, we verify.
        </p>
        {matchReasons && matchReasons.length > 0 && (
          <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-foreground/90">
            <span className="font-medium">Why this might fit you:</span> {matchReasons.join(' · ')}
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground/70">Raw job data is untouched. Intelligence is stored separately and evidence-backed.</p>
      </section>
    )
  }

  const africa = africaFitLabel(intelligence.africa_eligibility)
  const salary = salaryTruthLabel(intelligence)
  const company = companyLabel(intelligence.company_legitimacy)
  const overallConf = intelligence.overall_confidence ?? 0

  return (
    <section
      aria-label="Opportunity Intelligence"
      className="rounded-lg border border-border/70 bg-card px-4 py-5 sm:px-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          Opportunity Intelligence
        </h2>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${overallConf >= 70 ? 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300' : overallConf >= 40 ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-secondary text-muted-foreground'}`}>
            {overallConf}% overall confidence
          </span>
          {intelligence.last_verified_at && (
            <span className="text-[11px] text-muted-foreground">Verified {new Date(intelligence.last_verified_at).toLocaleDateString()}</span>
          )}
        </div>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Africa fit */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Globe className="h-3 w-3" aria-hidden /> Africa Fit
          </p>
          <p className={`mt-1.5 text-sm font-medium ${africa.tone === 'positive' ? 'text-foreground' : africa.tone === 'caution' && intelligence.africa_eligibility === 'restricted' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground/80'}`}>
            {africa.label}
          </p>
          {intelligence.africa_confidence != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.africa_confidence}% confidence</p>
          )}
          {intelligence.country_restrictions && intelligence.country_restrictions.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">Restrictions: {intelligence.country_restrictions.join(', ')}</p>
          )}
          {intelligence.visa_sponsorship && intelligence.visa_sponsorship !== 'unknown' && (
            <p className="mt-1 text-[11px] text-muted-foreground">Visa: {intelligence.visa_sponsorship.replace('_', ' ')}</p>
          )}
          <EvidenceQuote text={intelligence.africa_evidence} url={intelligence.africa_source_urls?.[0]} />
        </div>

        {/* Remote policy */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden /> Remote Policy
          </p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{remoteLabel(intelligence.remote_eligibility)}</p>
          {intelligence.timezone_requirements && (
            <p className="mt-1 text-[11px] text-muted-foreground">Timezone: {intelligence.timezone_requirements}</p>
          )}
          {intelligence.remote_confidence != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.remote_confidence}% confidence</p>
          )}
          <EvidenceQuote text={intelligence.remote_evidence} url={intelligence.evidence_urls?.[0]} />
        </div>

        {/* Salary truthfulness */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Banknote className="h-3 w-3" aria-hidden /> Salary Truthfulness
          </p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{salary.label}</p>
          {salary.detail && <p className="mt-1 text-[11px] text-muted-foreground">{salary.detail}</p>}
          {intelligence.salary_currency && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {intelligence.salary_currency} {intelligence.salary_min != null ? `${intelligence.salary_min}` : ''} {intelligence.salary_max != null ? `– ${intelligence.salary_max}` : ''} {intelligence.salary_period ? `/ ${intelligence.salary_period}` : ''} {intelligence.salary_is_estimated ? '(estimated)' : ''}
            </p>
          )}
          {intelligence.salary_transparency && (
            <p className="mt-1 text-[11px] text-muted-foreground">Transparency: {intelligence.salary_transparency}</p>
          )}
          {intelligence.salary_confidence != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.salary_confidence}% confidence</p>
          )}
          <EvidenceQuote text={intelligence.salary_evidence} url={intelligence.evidence_urls?.[0]} />
        </div>

        {/* Company legitimacy */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 className="h-3 w-3" aria-hidden /> Company Legitimacy
          </p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{company.label}</p>
          {intelligence.company_confidence != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.company_confidence}% confidence</p>
          )}
          {intelligence.job_quality && (
            <p className="mt-1 text-[11px] text-muted-foreground">Job quality: {intelligence.job_quality} {intelligence.job_quality_confidence ? `(${intelligence.job_quality_confidence}%)` : ''}</p>
          )}
          {intelligence.application_difficulty && (
            <p className="mt-1 text-[11px] text-muted-foreground">Application: {intelligence.application_difficulty} • Urgency: {intelligence.hiring_urgency || 'unknown'}</p>
          )}
          <EvidenceQuote text={intelligence.company_evidence || intelligence.job_quality_evidence} url={intelligence.evidence_urls?.[0]} />
        </div>

        {/* Experience level */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <GraduationCap className="h-3 w-3" aria-hidden /> Experience Level
          </p>
          <p className="mt-1.5 text-sm font-medium text-foreground/90">{expLabel(intelligence.experience_level)}</p>
          {intelligence.experience_confidence != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">{intelligence.experience_confidence}% confidence</p>
          )}
        </div>

        {/* Skill match */}
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Wrench className="h-3 w-3" aria-hidden /> Skill Match
          </p>
          {intelligence.required_skills && intelligence.required_skills.length > 0 ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">
              Required: {intelligence.required_skills.join(', ')}
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] text-muted-foreground">Required skills: unknown – no evidence in posting</p>
          )}
          {intelligence.transferable_skills && intelligence.transferable_skills.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">Transferable: {intelligence.transferable_skills.join(', ')}</p>
          )}
          {intelligence.missing_skills && intelligence.missing_skills.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Potential gaps: {intelligence.missing_skills.join(', ')}</p>
          )}
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
          {(intelligence.evidence_urls || []).slice(0, 5).map((u, i) => (
            <li key={i}>
              <a href={u} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-border/60 bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                Source {i + 1}
              </a>
            </li>
          ))}
          {(intelligence.africa_source_urls || []).slice(0, 3).map((u, i) => (
            <li key={`a-${i}`}>
              <a href={u} target="_blank" rel="noreferrer" className="inline-flex rounded-md border border-border/60 bg-secondary px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                Africa source
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
          Intelligence is evidence-based, stored separately from raw job data, never fabricated. When evidence is missing we show UNKNOWN. Model: {intelligence.model_version} • Verified: {intelligence.last_verified_at ? new Date(intelligence.last_verified_at).toLocaleString() : 'unknown'}
        </p>
      </div>
    </section>
  )
}
