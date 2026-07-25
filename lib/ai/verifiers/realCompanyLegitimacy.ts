import type { Job } from "@/lib/types"
export async function verifyCompanyLegitimacyReal(job: Job) {
  const now = new Date().toISOString()
  const hasLogo = !!job.company_logo
  const hasTrustedAts = job.apply_url.includes("greenhouse.io") || job.apply_url.includes("lever.co") || job.apply_url.includes("ashbyhq.com") || job.apply_url.includes("remoteok.com")
  let legitimacy: "verified" | "likely_legit" | "unknown" | "suspicious" = "unknown"
  let confidence = 20
  let evidence = "No logo nor trusted ATS"
  if (hasLogo && hasTrustedAts) {
    legitimacy = "verified"
    confidence = 85
    evidence = `Logo + trusted ATS ${new URL(job.apply_url).hostname}`
  } else if (hasTrustedAts) {
    legitimacy = "likely_legit"
    confidence = 70
    evidence = `ATS apply ${new URL(job.apply_url).hostname}`
  } else if (hasLogo) {
    legitimacy = "likely_legit"
    confidence = 60
    evidence = "Company logo present"
  }
  const lower = job.description_md.toLowerCase()
  if (/pay.*to.*apply|buy.*kit|telegram.*apply|whatsapp.*apply/i.test(lower)) {
    legitimacy = "suspicious"
    confidence = 90
    evidence = "Scam pattern detected"
  }
  return { legitimacy, confidence, evidence, sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-v1" }
}
