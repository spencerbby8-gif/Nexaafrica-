import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

export async function verifyJobQualityAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageText = ""
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Quality Verifier" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageText = cleanDescription(html).slice(0, 5000)
    }
  } catch {}

  const combined = `${job.description_md}\n\n${jobPageText}`.slice(0, 7000)

  const prompt = `Score job quality for this remote job.

Title: ${job.title}
Company: ${job.company}
Description (first 3000 chars): ${combined.slice(0,3000)}

Check for:
- Description length (detailed >500 chars is high quality)
- Has responsibilities section
- Has requirements/qualifications section
- Has benefits/perks section
- Has clear application steps
- Scam risk: pay to apply, buy kit, unrealistic earnings, envelope stuffing
- Application clarity

Return JSON only:
{
  "quality": "high|medium|low|unknown",
  "confidence": 0-100,
  "evidence": "verbatim quote max 200 chars",
  "reasons": ["Detailed >500 chars", "Has responsibilities"]
}`

  try {
    const gwResult = await aiGateway({
      prompt,
      systemInstruction: "You are a job quality verifier. Be evidence-based, never guess. Return UNKNOWN when evidence missing.",
      agentId: "verifier:job-quality",
      jobId: job.id,
      temperature: 0.2,
      maxTokens: 500,
    })
    const text = gwResult.response.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        quality: parsed.quality || "unknown",
        confidence: parsed.confidence || 20,
        evidence: (parsed.evidence || "").slice(0,200),
        reasons: parsed.reasons || [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gwResult.response.provider}:${gwResult.response.model}`,
      }
    }
  } catch (e) {
    console.warn(`[Quality Verifier] AI failed, fallback: ${e}`)
  }

  // Fallback rule-based
  let score = 0
  const reasons: string[] = []
  if (combined.length > 500) { score += 30; reasons.push("Detailed >500 chars") }
  else if (combined.length > 200) { score += 15; reasons.push("Adequate") }
  else reasons.push("Short <200")
  if (/responsibilities|what you'll do/i.test(combined)) { score += 20; reasons.push("Has responsibilities") }
  if (/requirements|qualifications/i.test(combined)) { score += 20; reasons.push("Has requirements") }
  if (/benefits|perks/i.test(combined)) { score += 15; reasons.push("Lists benefits") }
  if (/pay.*to.*apply|buy.*kit/i.test(combined.toLowerCase())) { score = Math.max(0, score-50); reasons.push("Scam language") }

  let quality: "high" | "medium" | "low" | "unknown" = "unknown"
  if (score >= 70) quality = "high"
  else if (score >= 40) quality = "medium"
  else if (score >= 0) quality = "low"

  return {
    quality,
    confidence: quality === "high" ? 80 : quality === "medium" ? 60 : 70,
    evidence: reasons.join("; ").slice(0,200),
    reasons,
    sourceUrls: [job.apply_url],
    lastVerified: now,
    modelVersion: "rule-based-fallback",
  }
}

export const verifyJobQualityReal = verifyJobQualityAI
