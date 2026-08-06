import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"
import { companyLegitimacyOwner } from "@/lib/company/legitimacy"

export function employerLegitimacySignal(job: Job): TrustSignal | null {
  const hasLogo = !!job.company_logo
  // [§17 CANONICAL COMPANY PLANE] The trust plane never re-derives company
  // identity on its own: it asks the single canonical owner. "Verified
  // employer" asserts exactly what the JAI row asserts — the same registry,
  // the same basis sentence.
  const verdict = companyLegitimacyOwner({ company: job.company })

  // Known high-trust companies (canonical owner: curated registry)
  if (verdict.value === "verified") {
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
    // [TRUTH LAYER v1] A logo is branding metadata, NOT evidence of
    // legitimacy. Proven live: a first-seen recruiting agency reached raw
    // trust_score 100 partly via "+8 logo indicates legitimate employer
    // presence". Logos are trivially copyable by scammers; they earn a
    // small presentation-quality point with honest copy, nothing more.
    return {
      id: "employer_legitimacy",
      label: "Employer branding present",
      scoreImpact: 3,
      confidence: "low",
      tone: "neutral",
      explanation: `Listing includes a company logo via the ${job.source || "source"} feed. A logo is cosmetic metadata — it is not proof that the employer is legitimate.`,
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
