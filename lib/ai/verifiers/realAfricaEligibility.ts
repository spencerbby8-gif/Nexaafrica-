import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"

export interface AfricaVerification {
  eligibility: "explicit" | "likely" | "restricted" | "unknown"
  confidence: number
  evidence: string
  countryRestrictions: string[]
  visaSponsorship: "available" | "not_available" | "unknown" | "conditional"
  languageRequirements: string[]
  sourceUrls: string[]
  lastVerified: string
  modelVersion: string
}

export async function verifyAfricaEligibilityReal(job: Job): Promise<AfricaVerification> {
  const now = new Date().toISOString()
  const modelVersion = "rule-based-v1 + web-research"
  let jobPageText = ""
  let sourceUrls: string[] = [job.apply_url]
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(job.apply_url, {
      headers: { "User-Agent": "Nexa Africa Verifier (contact: hello@nexa.africa)" },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageText = cleanDescription(html).slice(0, 5000)
      sourceUrls.push(job.apply_url)
    }
  } catch {}
  const combinedText = `${job.description_md} ${jobPageText}`.toLowerCase()
  const countryPatterns = [
    { re: /\b(us|usa|united states)\s+only\b/i, country: "United States" },
    { re: /\buk\s+only\b|\bunited kingdom\s+only\b/i, country: "United Kingdom" },
    { re: /\beu\s+only\b|\beurope\s+only\b/i, country: "EU" },
    { re: /\bcanada\s+only\b/i, country: "Canada" },
  ]
  const restrictions: string[] = []
  for (const p of countryPatterns) {
    if (p.re.test(combinedText)) restrictions.push(p.country)
  }
  const hasAfricaExplicit = /africa|nigeria|kenya|south africa|ghana|egypt|morocco|ethiopia|tanzania|uganda|rwanda/i.test(combinedText)
  const hasWorldwide = /worldwide|anywhere|global.*remote|remote.*global|work from anywhere/i.test(combinedText)
  const hasRestriction = /us only|uk only|eu only|must reside in|residents only|no visa sponsorship/i.test(combinedText)
  const hasVisaAvailable = /visa sponsorship available|visa support|work permit.*provided/i.test(combinedText)
  const hasVisaNotAvailable = /no visa sponsorship|visa sponsorship not available|visa.*not.*available/i.test(combinedText)
  const langMatches = combinedText.match(/(english|french|german|spanish|arabic)\s*(c[12]|native|fluent)/gi) || []
  const languageRequirements = [...new Set(langMatches.map(s => s.trim()))]
  let eligibility: AfricaVerification["eligibility"] = "unknown"
  let confidence = 20
  let evidence = "No explicit Africa or restriction mention found in job description or job page"
  if (hasAfricaExplicit) {
    eligibility = "explicit"
    confidence = 90
    const match = combinedText.match(/[^.]*africa[^.]*/i) || combinedText.match(/[^.]*(nigeria|kenya|south africa|ghana)[^.]*/i)
    evidence = match ? match[0].slice(0, 200) : "Africa explicitly mentioned"
  } else if (hasRestriction) {
    eligibility = "restricted"
    confidence = 80
    const match = combinedText.match(/[^.]*(us only|uk only|eu only|must reside[^.]*|residents only)[^.]*/i)
    evidence = match ? match[0].slice(0, 200) : "Geographic restriction detected"
  } else if (hasWorldwide) {
    eligibility = "likely"
    confidence = 60
    evidence = "Worldwide/anywhere hiring language with no restriction"
  }
  return {
    eligibility,
    confidence,
    evidence,
    countryRestrictions: restrictions,
    visaSponsorship: hasVisaNotAvailable ? "not_available" : hasVisaAvailable ? "available" : "unknown",
    languageRequirements,
    sourceUrls,
    lastVerified: now,
    modelVersion,
  }
}
