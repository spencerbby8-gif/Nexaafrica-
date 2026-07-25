import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"

export interface SalaryVerification {
  min: number | null
  max: number | null
  currency: string | null
  period: string | null
  isEstimated: boolean
  transparency: "disclosed" | "estimated" | "undisclosed" | "unknown"
  confidence: number
  evidence: string
  sourceUrls: string[]
  lastVerified: string
  modelVersion: string
}

export async function verifySalaryReal(job: Job): Promise<SalaryVerification> {
  const now = new Date().toISOString()
  const modelVersion = "rule-based-v1"
  let jobPageText = ""
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Verifier" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageText = cleanDescription(html).slice(0,5000)
    }
  } catch {}
  if (!jobPageText) jobPageText = job.description_md
  if (job.salary_min != null || job.salary_max != null) {
    return { min: job.salary_min, max: job.salary_max, currency: job.salary_currency, period: job.salary_period, isEstimated: false, transparency: "disclosed", confidence: 90, evidence: job.salary_range || "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion }
  }
  if (job.salary_range) {
    return { min: job.salary_min, max: job.salary_max, currency: job.salary_currency, period: job.salary_period, isEstimated: false, transparency: "disclosed", confidence: 80, evidence: job.salary_range, sourceUrls: [job.apply_url], lastVerified: now, modelVersion }
  }
  const salaryRegex = /(?:\$|USD|€|EUR|£|GBP)\s?(\d{1,3}(?:[,.]\d{3})*(?:k)?)\s?(?:-|–|to)\s?(?:\$|USD|€|EUR|£|GBP)?\s?(\d{1,3}(?:[,.]\d{3})*(?:k)?)/i
  const match = salaryRegex.exec(jobPageText)
  if (match) {
    return { min: null, max: null, currency: "USD", period: null, isEstimated: false, transparency: "disclosed", confidence: 70, evidence: match[0].slice(0,200), sourceUrls: [job.apply_url], lastVerified: now, modelVersion }
  }
  return { min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "undisclosed", confidence: 20, evidence: "No compensation listed", sourceUrls: [job.apply_url], lastVerified: now, modelVersion }
}
