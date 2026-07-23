import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"
import { INGEST_SOURCES } from "@/lib/ingest/companies"

const CURATED_COMPANIES = new Set(INGEST_SOURCES.map(s => s.company.toLowerCase()))

export function employerLegitimacySignal(job: Job): TrustSignal | null {
  const companyLower = job.company.toLowerCase().trim()
  const hasLogo = !!job.company_logo
  const isCurated = CURATED_COMPANIES.has(companyLower) || CURATED_COMPANIES.has(job.company)

  // Known high-trust companies (from curated list)
  if (isCurated) {
    return {
      id: "employer_legitimacy",
      label: "Verified employer",
      scoreImpact: 15,
      confidence: "high",
      tone: "positive",
      explanation: `${job.company} is in Nexa's curated list of globally-distributed companies with verified public ATS feeds.`,
      evidence: `Company: ${job.company}`,
      source: "company",
    }
  }

  if (hasLogo) {
    return {
      id: "employer_legitimacy",
      label: "Employer with logo",
      scoreImpact: 8,
      confidence: "medium",
      tone: "positive",
      explanation: `Listing includes company logo and uses official ATS source (${job.source || "direct"}), indicating legitimate employer presence.`,
      evidence: job.company_logo || undefined,
      source: "company",
    }
  }

  // Unknown company, no logo — not negative, but lower trust, explain
  return {
    id: "employer_legitimacy",
    label: "New employer",
    scoreImpact: 0,
    confidence: "low",
    tone: "neutral",
    explanation: `Employer ${job.company} is new to Nexa. Listing is still verified via official ATS feed, but company history is limited.`,
    source: "company",
  }
}
