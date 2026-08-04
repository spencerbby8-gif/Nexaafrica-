import { Building2, Globe2, Banknote, BadgeCheck, AlertTriangle, FileText } from "lucide-react"

interface Props {
  companyIntel: Record<string, any> | null
  sourceIntel: Record<string, any> | null
  company: string
}

function pct(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(Number(v))) return null
  return `${Math.round(Number(v) * 100)}%`
}

/**
 * [V2.1] Company Intelligence panel — surfaces the REAL learning-layer data
 * (company_intelligence + source_intelligence) on the role page. Only renders
 * when data exists; every number is a measured value, nothing fabricated.
 * Never exposes provider names.
 */
export function CompanyIntelPanel({ companyIntel, sourceIntel, company }: Props) {
  if (!companyIntel && !sourceIntel) return null

  const total = Number(companyIntel?.total_jobs) || 0
  const velocity = Number(companyIntel?.hiring_velocity_30d) || 0
  const salaryConsistency = pct(companyIntel?.salary_consistency)
  const verificationRate = pct(companyIntel?.verification_rate)
  const rejectionRate = Number(companyIntel?.rejection_rate) || 0
  const scamReports = Number(companyIntel?.scam_reports) || 0
  const duplicates = Number(companyIntel?.duplicate_count) || 0

  const sourceTrust = Number(sourceIntel?.trust_score) || 0
  const sourceReliability = pct(sourceIntel?.reliability_score)
  const sourceVerified = pct(sourceIntel?.verification_rate)

  return (
    <section aria-label="Company Intelligence" className="rounded-lg border border-border/60 bg-secondary/20 p-4">
      <header className="flex items-center gap-2 border-b border-border/60 pb-2.5">
        <Building2 className="h-4 w-4 text-accent" aria-hidden />
        <h3 className="text-sm font-semibold tracking-tight">Company Intelligence</h3>
      </header>

      {companyIntel && (
        <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Active roles on Nexa:</span>
            <span className="ml-auto font-medium">{total}</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Roles posted in last 30 days:</span>
            <span className="ml-auto font-medium">{velocity}</span>
          </div>
          {salaryConsistency && (
            <div className="flex items-center gap-2">
              <Banknote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">Salary disclosed on:</span>
              <span className="ml-auto font-medium">{salaryConsistency} of roles</span>
            </div>
          )}
          {verificationRate && (
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">Verified by Nexa Intelligence:</span>
              <span className="ml-auto font-medium">{verificationRate} of roles</span>
            </div>
          )}
          {scamReports > 0 ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <span className="text-muted-foreground">User scam reports:</span>
              <span className="ml-auto font-medium text-amber-600 dark:text-amber-400">{scamReports}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">User scam reports:</span>
              <span className="ml-auto font-medium">None</span>
            </div>
          )}
          {duplicates > 0 && (
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">Duplicate listings seen:</span>
              <span className="ml-auto font-medium">{duplicates}</span>
            </div>
          )}
        </div>
      )}

      {sourceIntel && (
        <div className="mt-3 border-t border-border/40 pt-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Feed track record:</span>
            <span className="ml-auto font-medium">{sourceTrust > 0 ? `Trust ${sourceTrust}` : "No history yet"}</span>
          </div>
          {(sourceReliability || sourceVerified) && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
              {[sourceReliability && `Feed reliable ${sourceReliability} of runs`, sourceVerified && `${sourceVerified} of roles verified`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground/70">
        Measured from {company}'s listing history on Nexa. Not a guarantee — always confirm with the employer.
      </p>
    </section>
  )
}
