import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

export async function verifySalaryAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageText = ""
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Verifier" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageText = cleanDescription(html).slice(0, 5000)
    }
  } catch {}
  const combined = `${job.description_md}\n\n${jobPageText}`.slice(0,8000)
  const prompt = `Verify salary for job: ${job.title} at ${job.company}. Stored salary: ${job.salary_range || "none"}. Description: ${combined.slice(0,3000)}. Return JSON with min, max, currency, period, isEstimated, transparency disclosed/estimated/undisclosed/unknown, confidence, evidence quote. Never invent salary.`

  try {
    const gw = await aiGateway({ prompt, systemInstruction: "You are salary verifier. Evidence-based, never guess. Return UNKNOWN when missing.", agentId: "verifier:salary", jobId: job.id, temperature: 0.2, maxTokens: 500 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      return { min: p.min ?? job.salary_min, max: p.max ?? job.salary_max, currency: p.currency ?? job.salary_currency, period: p.period ?? job.salary_period, isEstimated: p.isEstimated ?? false, transparency: p.transparency || (job.salary_range ? "disclosed" : "undisclosed"), confidence: p.confidence || 20, evidence: (p.evidence || "").slice(0,200), sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gw.response.provider}:${gw.response.model}` }
    }
  } catch {}

  if (job.salary_min != null || job.salary_max != null) {
    return { min: job.salary_min, max: job.salary_max, currency: job.salary_currency, period: job.salary_period, isEstimated: false, transparency: "disclosed", confidence: 90, evidence: job.salary_range || "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" }
  }
  return { min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "undisclosed", confidence: 20, evidence: "No compensation listed", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" }
}
export const verifySalaryReal = verifySalaryAI
