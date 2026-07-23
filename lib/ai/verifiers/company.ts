import type { Job } from "@/lib/types"

export function verifyCompanyLegitimacy(job: Job) {
  const hasLogo = !!job.company_logo
  const hasApplyUrl = job.apply_url.includes(job.company.toLowerCase().split(' ')[0]) || job.apply_url.includes('greenhouse.io') || job.apply_url.includes('lever.co') || job.apply_url.includes('ashbyhq.com')

  if (hasLogo && hasApplyUrl) {
    return { value: "verified" as const, confidence: 80, evidence: `Logo present + ATS apply ${job.apply_url}`, sourceUrls: [job.apply_url] }
  }
  if (hasApplyUrl) {
    return { value: "likely_legit" as const, confidence: 60, evidence: `ATS apply ${job.apply_url}`, sourceUrls: [job.apply_url] }
  }
  return { value: "unknown" as const, confidence: 20, evidence: "No logo nor ATS", sourceUrls: [job.apply_url] }
}
