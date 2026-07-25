import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"
import { extractSalary as extractSalaryIntelligence } from "@/lib/intelligence"

function extractSalaryContext(text: string): { match: string; context: string } | null {
  // Look for salary patterns in full text, return match + surrounding context
  const salaryRegex = /(\$|€|£|USD|EUR|GBP)\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*(k|K)?\s*(?:[-–—to]+\s*(?:\$|€|£|USD|EUR|GBP)?\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*(k|K)?)?(?:\s*\/\s*(year|month|week|day|hour|annum))?/i
  // Also match "Estimated annual salary of $234,000 - $321,000"
  const patterns = [
    /Estimated annual salary of\s*\$?[\d,\s]+(?:\s*[-–—to]+\s*\$?[\d,\s]+)?/i,
    /(?:\$|€|£)\s*\d{1,3}(?:,\d{3})*(?:\s*[kK])?\s*[-–—to]+\s*(?:\$|€|£)?\s*\d{1,3}(?:,\d{3})*(?:\s*[kK])?/i,
    /(?:USD|EUR|GBP)\s*\d{1,3}(?:,\d{3})*\s*[-–—to]+\s*\d{1,3}(?:,\d{3})*/i,
    salaryRegex
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m && m[0]) {
      const idx = m.index || 0
      const start = Math.max(0, idx - 150)
      const end = Math.min(text.length, idx + m[0].length + 150)
      return { match: m[0].trim(), context: text.slice(start, end).replace(/\s+/g, ' ').trim() }
    }
  }
  return null
}

export async function verifySalaryAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageTextFull = ""
  let jobPageHtmlLength = 0
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Verifier Salary" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageHtmlLength = html.length
      jobPageTextFull = cleanDescription(html) // full cleaned text, not sliced
    }
  } catch {}

  const combinedFull = `${job.description_md}\n\n${jobPageTextFull}`
  const salaryContext = extractSalaryContext(combinedFull)

  // Also try intelligence extraction as secondary
  const intelSalary = extractSalaryIntelligence(combinedFull)

  // If salary found via regex in actual job page, use it as real evidence (truthful, not template)
  if (salaryContext) {
    const hasRange = /[-–—to]+/.test(salaryContext.match)
    const transparency = hasRange ? "disclosed" as const : "disclosed" as const
    // Try to parse min/max from intelligence extraction if available
    const min = intelSalary?.min ?? job.salary_min
    const max = intelSalary?.max ?? job.salary_max
    const currency = intelSalary?.currency ?? job.salary_currency ?? (salaryContext.match.includes('$') ? 'USD' : salaryContext.match.includes('€') ? 'EUR' : salaryContext.match.includes('£') ? 'GBP' : null)
    return {
      min,
      max,
      currency,
      period: intelSalary?.period ?? job.salary_period ?? "year",
      isEstimated: /estimated/i.test(salaryContext.context),
      transparency,
      confidence: 90,
      evidence: salaryContext.context.slice(0, 200), // verbatim context from page
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: `regex-extracted-from-page-${jobPageHtmlLength}bytes`
    }
  }

  // If no regex found but job table has salary_range, use that as real ATS data (not placeholder)
  if (job.salary_min != null || job.salary_max != null || job.salary_range) {
    return {
      min: job.salary_min,
      max: job.salary_max,
      currency: job.salary_currency,
      period: job.salary_period,
      isEstimated: false,
      transparency: "disclosed" as const,
      confidence: 70,
      evidence: job.salary_range || "",
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: "job-table-fallback-real"
    }
  }

  // Try AI gateway with full context including salary snippet if found
  const combinedForPrompt = `${job.description_md}\n\n${jobPageTextFull}`.slice(0, 8000)
  const prompt = `Verify salary for job: ${job.title} at ${job.company}. Stored salary: ${job.salary_range || "none"}. Full description and page text (first 8000 chars): ${combinedForPrompt.slice(0, 6000)}. 

Return JSON with min, max, currency, period, isEstimated, transparency disclosed/estimated/undisclosed/unknown, confidence, evidence quote verbatim from text where salary appears (max 200 chars). Never invent salary. If you claim undisclosed while text contains "$" salary pattern, that is failure. Evidence must be exact quote from text.`

  try {
    const gw = await aiGateway({ prompt, systemInstruction: "You are salary verifier. Evidence-based, never guess. Return UNKNOWN when missing. Evidence must be verbatim quote from description where salary appears, not generic.", agentId: "verifier:salary", jobId: job.id, temperature: 0.1, maxTokens: 500 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      const ev = (p.evidence || "").toString().trim()
      const isGeneric = /^(no compensation listed)$/i.test(ev)
      // If AI claims undisclosed but we have real salaryContext from page, override with disclosed (real evidence)
      if (p.transparency === "undisclosed" && combinedFull.match(/\$[\d,]+/)) {
        const ctx = extractSalaryContext(combinedFull)
        if (ctx) {
          return {
            min: job.salary_min,
            max: job.salary_max,
            currency: job.salary_currency,
            period: job.salary_period,
            isEstimated: false,
            transparency: "disclosed" as const,
            confidence: 85,
            evidence: ctx.context.slice(0, 200),
            sourceUrls: [job.apply_url],
            lastVerified: now,
            modelVersion: `regex-override-${gw.response.provider}:${gw.response.model}`
          }
        }
      }
      return {
        min: p.min ?? job.salary_min,
        max: p.max ?? job.salary_max,
        currency: p.currency ?? job.salary_currency,
        period: p.period ?? job.salary_period,
        isEstimated: p.isEstimated ?? false,
        transparency: p.transparency || "unknown",
        confidence: p.confidence || 20,
        evidence: isGeneric ? "" : ev.slice(0,200),
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gw.response.provider}:${gw.response.model}`
      }
    }
  } catch (e) {
    console.warn(`[verifier:salary] failed ${job.id}`, e instanceof Error ? e.message.slice(0,100) : String(e).slice(0,100))
  }

  return { min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "unknown" as const, confidence: 0, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "failed-no-evidence" }
}
export const verifySalaryReal = verifySalaryAI
