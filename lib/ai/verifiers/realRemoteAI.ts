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
    const gw = await aiGateway({ prompt, systemInstruction: "You are remote policy verifier. Evidence-based, never guess.", agentId: "verifier:remote-policy", jobId: job.id, temperature: 0.2, maxTokens: 500 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      return { eligibility: p.eligibility || "unknown", confidence: p.confidence || 20, evidence: (p.evidence || "").slice(0,200), timezoneRequirements: p.timezoneRequirements, travelRequirements: p.travelRequirements, asyncFlexibility: p.asyncFlexibility || false, sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gw.response.provider}:${gw.response.model}` }
    }
  } catch {}

  const lower = combined.toLowerCase()
  const hasFullyRemote = /fully remote|work from anywhere|remote.*worldwide/i.test(lower)
  const hasHybrid = /hybrid|2 days in office/i.test(lower)
  const hasOnsite = /on[-\s]?site only|must be in office/i.test(lower)

  if (hasFullyRemote || job.is_remote) {
    return { eligibility: "fully_remote" as const, confidence: hasFullyRemote ? 85 : 60, evidence: hasFullyRemote ? "Fully remote language" : "Marked as remote in ATS", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" }
  }
  if (hasHybrid) return { eligibility: "hybrid" as const, confidence: 75, evidence: "Hybrid language", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" }
  if (hasOnsite) return { eligibility: "onsite" as const, confidence: 80, evidence: "Onsite only", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" }
  return { eligibility: "unknown" as const, confidence: 20, evidence: "No remote policy stated", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" }
}
export const verifyRemotePolicyReal = verifyRemotePolicyAI
