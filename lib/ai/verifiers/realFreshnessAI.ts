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
      systemInstruction: "You are a freshness verifier. Use posted_at, last_seen_at, expires_at to determine if job is active, expired, stale, ghost, or unknown. Be evidence-based, never guess.",
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
        evidence: (parsed.evidence || "").slice(0,200),
        postedAgeDays: parsed.postedAgeDays ?? null,
        lastSeenAgeDays: parsed.lastSeenAgeDays ?? null,
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: `${gwResult.response.provider}:${gwResult.response.model}`,
      }
    }
  } catch (e) {
    console.warn(`[Freshness Verifier] AI failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Fallback rule-based
  const postedAt = job.posted_at ? new Date(job.posted_at).getTime() : null
  const lastSeenRaw = (job as any).last_seen_at || job.created_at
  const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : nowMs
  const expiresAt = job.expires_at ? new Date(job.expires_at).getTime() : null

  let status: "active" | "expired" | "stale" | "ghost" | "unknown" = "unknown"
  let confidence = 30
  let evidence = "No dates"

  if (expiresAt && expiresAt < nowMs) {
    status = "expired"
    confidence = 90
    evidence = `Expires at ${job.expires_at} in past`
  } else if (postedAt) {
    const ageDays = (nowMs - postedAt) / (1000*60*60*24)
    if (ageDays > 90) {
      status = "stale"
      confidence = 80
      evidence = `Posted ${Math.floor(ageDays)} days ago (>90d)`
    } else if (ageDays > 60) {
      status = "stale"
      confidence = 60
      evidence = `Posted ${Math.floor(ageDays)} days ago`
    } else {
      status = "active"
      confidence = 85
      evidence = `Posted ${Math.floor(ageDays)} days ago, fresh`
    }
  }

  const lastSeenAgeDays = Math.floor((nowMs - lastSeen) / (1000*60*60*24))
  if (lastSeenAgeDays > 14 && status === "active") {
    status = "ghost"
    confidence = 70
    evidence += `; Not seen in feed for ${lastSeenAgeDays} days, may be ghost`
  }

  return {
    status,
    confidence,
    evidence,
    postedAgeDays: postedAt ? Math.floor((nowMs - postedAt)/(1000*60*60*24)) : null,
    lastSeenAgeDays,
    sourceUrls: [job.apply_url],
    lastVerified: now,
    modelVersion: "rule-based-fallback",
  }
}

export const verifyFreshnessReal = verifyFreshnessAI
