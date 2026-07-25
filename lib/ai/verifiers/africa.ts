import type { Job } from "@/lib/types"

export function verifyAfricaEligibility(job: Job) {
  const text = `${job.title} ${job.description_md} ${job.location || ""}`.toLowerCase()
  const hasAfricaExplicit = /africa|nigeria|kenya|south africa|ghana|egypt/i.test(text)
  const hasRestriction = /us only|uk only|eu only|must reside in|residents only|no visa sponsorship/i.test(text)

  if (hasAfricaExplicit) {
    return { value: "explicit" as const, confidence: 90, evidence: text.slice(0,200), sourceUrls: [job.apply_url] }
  }
  if (hasRestriction) {
    return { value: "restricted" as const, confidence: 80, evidence: text.slice(0,200), sourceUrls: [job.apply_url] }
  }
  if (job.is_remote && !hasRestriction) {
    return { value: "likely" as const, confidence: 60, evidence: "Remote with no restriction", sourceUrls: [job.apply_url] }
  }
  return { value: "unknown" as const, confidence: 20, evidence: "No evidence", sourceUrls: [job.apply_url] }
}
