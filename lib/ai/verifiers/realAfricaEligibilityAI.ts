import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

export async function verifyAfricaEligibilityAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageText = ""
  let sourceUrls: string[] = [job.apply_url]
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Verifier" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageText = cleanDescription(html).slice(0, 5000)
      sourceUrls.push(job.apply_url)
    }
  } catch {}
  const combined = `${job.description_md}\n\n${jobPageText}`.toLowerCase()
  const hasAfricaExplicit = /africa|nigeria|kenya|south africa|ghana/i.test(combined)
  const hasRestriction = /us only|uk only|eu only|must reside in|residents only|no visa sponsorship/i.test(combined)
  const hasWorldwide = /worldwide|anywhere|global.*remote/i.test(combined)

  const prompt = `Verify Africa eligibility for job: ${job.title} at ${job.company}. Location: ${job.location}. Description: ${combined.slice(0,3000)}. Return JSON with eligibility explicit/likely/restricted/unknown, confidence 0-100, evidence quote max 200 chars, countryRestrictions, visaSponsorship, languageRequirements. Never guess, return unknown when evidence missing.`

  try {
    const gw = await aiGateway({ prompt, systemInstruction: "You are Africa eligibility verifier. Evidence-based, never guess. Return UNKNOWN when missing. Always return a verbatim quote from the description as evidence, max 200 chars, or empty if none.", agentId: "verifier:africa-eligibility", jobId: job.id, temperature: 0.2, maxTokens: 500 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      const evidenceRaw = (p.evidence || "").toString().trim()
      // Ensure evidence is per-job verbatim, not generic placeholder - if evidence is generic like "No evidence" treat as empty
      const isGeneric = /^(no evidence|worldwide language|africa explicitly mentioned|geographic restriction)$/i.test(evidenceRaw)
      return {
        eligibility: p.eligibility || "unknown",
        confidence: p.confidence || 20,
        evidence: isGeneric ? "" : evidenceRaw.slice(0,200),
        countryRestrictions: p.countryRestrictions || [],
        visaSponsorship: p.visaSponsorship || "unknown",
        languageRequirements: p.languageRequirements || [],
        sourceUrls,
        lastVerified: now,
        modelVersion: `${gw.response.provider}:${gw.response.model}`
      }
    }
  } catch (e) {
    console.warn(`[verifier:africa] gateway failed for job ${job.id}:`, e instanceof Error ? e.message.slice(0,100) : String(e).slice(0,100))
  }

  // Fallback: return UNKNOWN with no placeholder evidence when real AI genuinely fails
  // Do not persist template values like "Worldwide language" – that causes identical values across jobs
  return {
    eligibility: "unknown" as const,
    confidence: 10,
    evidence: "",
    countryRestrictions: [],
    visaSponsorship: "unknown" as const,
    languageRequirements: [],
    sourceUrls,
    lastVerified: now,
    modelVersion: "failed-no-evidence"
  }
}
export const verifyAfricaEligibilityReal = verifyAfricaEligibilityAI
