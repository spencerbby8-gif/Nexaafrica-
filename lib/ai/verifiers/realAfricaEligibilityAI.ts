import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

function extractAfricaContext(text: string): { match: string; context: string } | null {
  const africaRegex = /\b(africa|nigeria|kenya|south africa|ghana|egypt|morocco|rwanda|uganda|ethiopia|tanzania|emea|us only|uk only|eu only|must reside|residents only|no visa sponsorship)\b/i
  const m = text.match(africaRegex)
  if (m && m[0]) {
    const idx = m.index || 0
    const start = Math.max(0, idx - 120)
    const end = Math.min(text.length, idx + m[0].length + 120)
    return { match: m[0], context: text.slice(start, end).replace(/\s+/g, ' ').trim() }
  }
  return null
}

export async function verifyAfricaEligibilityAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageTextFull = ""
  let jobPageHtmlLength = 0
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Verifier Africa" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageHtmlLength = html.length
      jobPageTextFull = cleanDescription(html)
    }
  } catch {}

  const combinedFull = `${job.description_md}\n\n${jobPageTextFull}`
  const africaContext = extractAfricaContext(combinedFull)

  // If no Africa context in actual job page, return UNKNOWN with empty evidence (honest), not generic template
  if (!africaContext) {
    // Try AI gateway with full text
    const prompt = `Verify Africa eligibility for job: ${job.title} at ${job.company}. Location: ${job.location}. Full description and page text (6000 chars): ${combinedFull.slice(0,6000)}. Return JSON with eligibility explicit/likely/restricted/unknown, confidence 0-100, evidence quote verbatim max 200 chars from text where Africa/restriction mentioned, countryRestrictions, visaSponsorship. Never guess, return unknown when evidence missing. Evidence must be verbatim quote.`
    try {
      const gw = await aiGateway({ prompt, systemInstruction: "You are Africa eligibility verifier. Evidence-based, never guess. Return UNKNOWN when missing. Evidence must be verbatim quote.", agentId: "verifier:africa-eligibility", jobId: job.id, temperature: 0.1, maxTokens: 400 })
      const m = gw.response.text.match(/\{[\s\S]*\}/)
      if (m) {
        const p = JSON.parse(m[0])
        const ev = (p.evidence || "").toString().trim()
        if (ev) {
          return {
            eligibility: p.eligibility || "unknown",
            confidence: p.confidence || 20,
            evidence: ev.slice(0,200),
            countryRestrictions: p.countryRestrictions || [],
            visaSponsorship: p.visaSponsorship || "unknown",
            languageRequirements: p.languageRequirements || [],
            sourceUrls: [job.apply_url],
            lastVerified: now,
            modelVersion: `${gw.response.provider}:${gw.response.model}`
          }
        }
      }
    } catch {}
    return {
      eligibility: "unknown" as const,
      confidence: 0,
      evidence: "",
      countryRestrictions: [],
      visaSponsorship: "unknown" as const,
      languageRequirements: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: "failed-no-evidence-no-africa-mention"
    }
  }

  // If context found, use it as real evidence, and try AI to classify
  const prompt = `Verify Africa eligibility for job: ${job.title} at ${job.company}. Location: ${job.location}. Found context: "${africaContext.context}". Full description: ${combinedFull.slice(0,5000)}. Return JSON with eligibility explicit/likely/restricted/unknown, confidence, evidence quote verbatim (must be exact substring from context), countryRestrictions, visaSponsorship.`

  try {
    const gw = await aiGateway({ prompt, systemInstruction: "You are Africa eligibility verifier. Evidence-based. Evidence must be verbatim quote from provided context.", agentId: "verifier:africa-eligibility", jobId: job.id, temperature: 0.1, maxTokens: 400 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      return {
        eligibility: p.eligibility || "unknown",
        confidence: p.confidence || 60,
        evidence: (p.evidence || africaContext.context).slice(0,200),
        countryRestrictions: p.countryRestrictions || [],
        visaSponsorship: p.visaSponsorship || "unknown",
        languageRequirements: p.languageRequirements || [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gw.response.provider}:${gw.response.model}`
      }
    }
  } catch {}

  // Fallback with real context as evidence (not generic template)
  const lower = africaContext.match.toLowerCase()
  let eligibility: "explicit"|"likely"|"restricted"|"unknown" = "unknown"
  if (/africa|nigeria|kenya|south africa|ghana|egypt/i.test(lower)) eligibility = "explicit"
  else if (/us only|uk only|eu only|must reside|residents only|no visa sponsorship/i.test(lower)) eligibility = "restricted"
  else if (/worldwide|anywhere|global.*remote/i.test(lower)) eligibility = "likely"

  return {
    eligibility,
    confidence: eligibility === "explicit" ? 75 : eligibility === "restricted" ? 70 : 0,
    evidence: africaContext.context.slice(0,200),
    countryRestrictions: [],
    visaSponsorship: "unknown" as const,
    languageRequirements: [],
    sourceUrls: [job.apply_url],
    lastVerified: now,
    modelVersion: `regex-extracted-${jobPageHtmlLength}bytes`
  }
}
export const verifyAfricaEligibilityReal = verifyAfricaEligibilityAI
