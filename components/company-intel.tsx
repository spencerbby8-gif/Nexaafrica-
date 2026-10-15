import {companyAssessment} from '@/lib/company-assessment'
import { Building2, Globe, Users, Tag, Briefcase, ExternalLink } from 'lucide-react'
import type { Job } from '@/lib/types'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'
import { CompanyAvatar } from '@/components/company-avatar'

/**
 * Company Intelligence — surfaces useful facts about the employer:
 * website, category/industry, hiring activity, and legitimacy verdict.
 * All data comes from the live backend — nothing invented.
 */
export function CompanyIntel({
  job,
  intelligence,
  companyJobCount,
}: {
  job: Job
  intelligence?: JobAIIntelligenceRow | null
  companyJobCount?: number | null
}) {
  // Derive website from apply_url domain (strip ATS hosts)
  let website: string | null = null
  try {
    const u = new URL(job.apply_url)
    const atsHosts = ['greenhouse.io', 'ashbyhq.com', 'lever.co', 'workable.com', 'smartrecruiters.com', 'recruitee.com', 'comeet.com', 'personio.com', 'himalayas', 'remoteok', 'remotive', 'weworkremotely', 'lifelancer']
    if (!atsHosts.some(h => u.hostname.includes(h))) {
      website = u.hostname
    }
  } catch {}

  const assessment=companyAssessment(intelligence)
  const legitimacyLabel=assessment.label

  const facts: Array<{ icon: typeof Globe; label: string; value: string }> = []

  if (website) {
    facts.push({ icon: Globe, label: 'Application host', value: website })
  }
  if (job.category) {
    facts.push({ icon: Tag, label: 'Role category', value: job.category.replace(/-/g, ' ') })
  }
  if (companyJobCount != null && companyJobCount > 0) {
    facts.push({ icon: Briefcase, label: 'Feed records', value: `${companyJobCount} listing${companyJobCount === 1 ? '' : 's'}` })
  }
  if (job.source) {
    facts.push({ icon: Users, label: 'Source', value: job.source })
  }

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
      <div className="flex items-center gap-3">
        <CompanyAvatar name={job.company} src={job.company_logo} size={36} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">{job.company}</h3>
          {legitimacyLabel && (
            <p className={`text-[12px] ${
              assessment.tone === 'caution' ? 'text-amber-400' : 'text-muted-foreground'
            }`}>
              {legitimacyLabel}

            </p>
          )}
        </div>
        {website && (
          <a
            href={`https://${website}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
          >
            <ExternalLink className="h-3 w-3" aria-hidden /> Visit
          </a>
        )}
      </div>

      {assessment.detail && <p className="mt-2 text-xs text-muted-foreground">{assessment.detail}</p>}
      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {facts.map((f) => (
            <div key={f.label} className="flex items-center gap-1.5">
              <f.icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{f.label}</dt>
                <dd className="truncate text-[12px] font-medium text-foreground/80 capitalize">{f.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}

      {intelligence?.company_evidence && (
        <p className="mt-3 border-l-2 border-border pl-2.5 text-[12px] italic leading-relaxed text-foreground/70">
          &ldquo;{intelligence.company_evidence}&rdquo;
        </p>
      )}
    </div>
  )
}
