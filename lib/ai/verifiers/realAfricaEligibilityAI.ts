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
    const gw = await aiGateway({ prompt, systemInstruction: "You are Africa eligibility verifier. Evidence-based, never guess. Return UNKNOWN when missing.", agentId: "verifier:africa-eligibility", jobId: job.id, temperature: 0.2, maxTokens: 500 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      return { eligibility: p.eligibility || "unknown", confidence: p.confidence || 20, evidence: (p.evidence || "").slice(0,200), countryRestrictions: p.countryRestrictions || [], visaSponsorship: p.visaSponsorship || "unknown", languageRequirements: p.languageRequirements || [], sourceUrls, lastVerified: now, modelVersion: `${gw.response.provider}:${gw.response.model}` }
    }
  } catch {}

  let eligibility: "explicit"|"likely"|"restricted"|"unknown" = "unknown"
  let confidence = 20
  let evidence = "No evidence"
  if (hasAfricaExplicit) { eligibility = "explicit"; confidence = 90; evidence = "Africa explicitly mentioned" }
  else if (hasRestriction) { eligibility = "restricted"; confidence = 80; evidence = "Geographic restriction" }
  else if (hasWorldwide) { eligibility = "likely"; confidence = 60; evidence = "Worldwide language" }

  return { eligibility, confidence, evidence, countryRestrictions: [], visaSponsorship: "unknown" as const, languageRequirements: [], sourceUrls, lastVerified: now, modelVersion: "rule-based-v1 + web-research" }
}
export const verifyAfricaEligibilityReal = verifyAfricaEligibilityAI
