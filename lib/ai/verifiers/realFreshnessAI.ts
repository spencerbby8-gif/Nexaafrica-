import type { Job } from "@/lib/types"
import { aiGateway } from "../gateway"

export async function verifyFreshnessAI(job: Job) {
  const now = new Date().toISOString()
  const nowMs = Date.now()

  const prompt = `Verify freshness for this job.

Title: ${job.title}
Company: ${job.company}
Posted At: ${job.posted_at}
Created At: ${job.created_at}
Expires At: ${job.expires_at || "none"}
Last Seen At: ${(job as any).last_seen_at || "none"}

Check:
- Is job still active, expired, stale, ghost, or unknown?
- Posted >90 days ago = stale
- Expires in past = expired
- Not seen in feed for 14+ days but still active = ghost
- Posted <7 days = fresh, active

Return JSON:
{
  "status": "active|expired|stale|ghost|unknown",
  "confidence": 0-100,
  "evidence": "verbatim reasoning max 200 chars",
  "postedAgeDays": number|null,
  "lastSeenAgeDays": number|null
}`

  try {
    const gwResult = await aiGateway({
      prompt,
      systemInstruction: "You are a freshness verifier. Use posted_at, last_seen_at, expires_at to determine if job is active, expired, stale, ghost, or unknown. Be evidence-based, never guess. Provide verbatim dates as evidence.",
      agentId: "verifier:freshness",
      jobId: job.id,
      temperature: 0.1,
      maxTokens: 400,
    })
    const text = gwResult.response.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        status: parsed.status || "unknown",
        confidence: parsed.confidence || 20,
        evidence: (parsed.evidence || "").toString().slice(0,200),
        postedAgeDays: parsed.postedAgeDays ?? null,
        lastSeenAgeDays: parsed.lastSeenAgeDays ?? null,
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gwResult.response.provider}:${gwResult.response.model}`,
      }
    }
  } catch (e) {
    console.warn(`[Freshness Verifier] AI failed, unknown: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Fallback: unknown when real AI fails, not template
  return {
    status: "unknown" as const,
    confidence: 10,
    evidence: "",
    postedAgeDays: null,
    lastSeenAgeDays: null,
    sourceUrls: [job.apply_url],
    lastVerified: now,
    modelVersion: "failed-no-evidence",
  }
}

export const verifyFreshnessReal = verifyFreshnessAI
