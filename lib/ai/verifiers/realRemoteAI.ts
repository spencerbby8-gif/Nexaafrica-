import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

export async function verifyRemotePolicyAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageText = job.description_md
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
  const combined = `${job.description_md}\n\n${jobPageText}`.slice(0,7000)
  const prompt = `Verify remote policy for job: ${job.title} at ${job.company}. Location: ${job.location}. Description: ${combined.slice(0,3000)}. Determine fully_remote/hybrid/onsite/unknown, timezone overlap, travel, async flexibility. Return JSON with eligibility, confidence, evidence quote, timezoneRequirements, travelRequirements, asyncFlexibility.`

  try {
    const gw = await aiGateway({ prompt, systemInstruction: "You are remote policy verifier. Evidence-based, never guess. Return verbatim quote from description as evidence.", agentId: "verifier:remote-policy", jobId: job.id, temperature: 0.2, maxTokens: 500 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      const ev = (p.evidence || "").toString().trim()
      const isGeneric = /^(fully remote language|marked as remote in ats|hybrid language|onsite only|no remote policy stated)$/i.test(ev)
      return {
        eligibility: p.eligibility || "unknown",
        confidence: p.confidence || 20,
        evidence: isGeneric ? "" : ev.slice(0,200),
        timezoneRequirements: p.timezoneRequirements,
        travelRequirements: p.travelRequirements,
        asyncFlexibility: p.asyncFlexibility || false,
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gw.response.provider}:${gw.response.model}`
      }
    }
  } catch (e) {
    console.warn(`[verifier:remote] gateway failed ${job.id}`, e instanceof Error ? e.message.slice(0,100) : String(e).slice(0,100))
  }

  return {
    eligibility: "unknown" as const,
    confidence: 10,
    evidence: "",
    timezoneRequirements: undefined,
    travelRequirements: undefined,
    asyncFlexibility: false,
    sourceUrls: [job.apply_url],
    lastVerified: now,
    modelVersion: "failed-no-evidence"
  }
}
export const verifyRemotePolicyReal = verifyRemotePolicyAI
