import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

function extractRemoteContext(text: string): { match: string; context: string } | null {
  const remoteRegex = /\b(fully remote|remote.*worldwide|work from anywhere|distributed|hybrid|on[-\s]?site only|must be in office|2 days in office|remote|wfh|work from home)\b/i
  const m = text.match(remoteRegex)
  if (m && m[0]) {
    const idx = m.index || 0
    const start = Math.max(0, idx - 120)
    const end = Math.min(text.length, idx + m[0].length + 120)
    return { match: m[0], context: text.slice(start, end).replace(/\s+/g, ' ').trim() }
  }
  return null
}

export async function verifyRemotePolicyAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageTextFull = ""
  let jobPageHtmlLength = 0
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(job.apply_url, { headers: { "User-Agent": "Nexa Verifier Remote" }, signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageHtmlLength = html.length
      jobPageTextFull = cleanDescription(html)
    }
  } catch {}

  const combinedFull = `${job.description_md}\n\n${jobPageTextFull}`
  const remoteContext = extractRemoteContext(combinedFull)

  if (!remoteContext) {
    return {
      eligibility: "unknown" as const,
      confidence: 0,
      evidence: "",
      timezoneRequirements: undefined,
      travelRequirements: undefined,
      asyncFlexibility: false,
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: "failed-no-evidence-no-remote-mention"
    }
  }

  const prompt = `Verify remote policy for job: ${job.title} at ${job.company}. Location: ${job.location}. Found context: "${remoteContext.context}". Full description: ${combinedFull.slice(0,5000)}. Determine fully_remote/hybrid/onsite/unknown and return JSON with eligibility, confidence, evidence verbatim from context, timezoneRequirements.`

  try {
    const gw = await aiGateway({ prompt, systemInstruction: "You are remote policy verifier. Evidence must be verbatim quote from context.", agentId: "verifier:remote-policy", jobId: job.id, temperature: 0.1, maxTokens: 400 })
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      return {
        eligibility: p.eligibility || "unknown",
        confidence: p.confidence || 60,
        evidence: (p.evidence || remoteContext.context).slice(0,200),
        timezoneRequirements: p.timezoneRequirements,
        travelRequirements: p.travelRequirements,
        asyncFlexibility: p.asyncFlexibility || false,
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gw.response.provider}:${gw.response.model}`
      }
    }
  } catch {}

  // Fallback with real context as evidence
  const lower = remoteContext.match.toLowerCase()
  let eligibility: "fully_remote"|"hybrid"|"onsite"|"unknown" = "unknown"
  if (/fully remote|work from anywhere|remote.*worldwide/i.test(lower) || job.is_remote) eligibility = "fully_remote"
  else if (/hybrid/i.test(lower)) eligibility = "hybrid"
  else if (/on[-\s]?site only|must be in office/i.test(lower)) eligibility = "onsite"

  return {
    eligibility,
    confidence: eligibility !== "unknown" ? 70 : 0,
    evidence: remoteContext.context.slice(0,200),
    timezoneRequirements: undefined,
    travelRequirements: undefined,
    asyncFlexibility: false,
    sourceUrls: [job.apply_url],
    lastVerified: now,
    modelVersion: `regex-extracted-${jobPageHtmlLength}bytes`
  }
}
export const verifyRemotePolicyReal = verifyRemotePolicyAI
