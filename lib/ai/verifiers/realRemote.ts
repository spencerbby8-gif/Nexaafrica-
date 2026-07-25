import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"

export async function verifyRemotePolicyReal(job: Job) {
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
  const lower = jobPageText.toLowerCase()
  const hasFullyRemote = /fully remote|work from anywhere|remote.*worldwide|worldwide.*remote/i.test(lower)
  const hasHybrid = /hybrid|2 days in office|3 days in office/i.test(lower)
  const hasOnsite = /on[-\s]?site only|must be in office/i.test(lower)
  const timezoneMatch = lower.match(/overlap.*(utc|est|pst|gmt).*(\d).*hours?|timezone.*(utc|est)/i)
  let eligibility: "fully_remote" | "hybrid" | "onsite" | "unknown" = "unknown"
  let confidence = 20
  let evidence = "No remote policy stated"
  if (hasFullyRemote || job.is_remote) {
    eligibility = "fully_remote"
    confidence = hasFullyRemote ? 85 : 60
    evidence = hasFullyRemote ? (lower.match(/[^.]*(fully remote|work from anywhere)[^.]*/i)?.[0]?.slice(0,200) || "Fully remote language") : "Marked as remote in ATS"
  } else if (hasHybrid) {
    eligibility = "hybrid"
    confidence = 75
    evidence = "Hybrid language detected"
  } else if (hasOnsite) {
    eligibility = "onsite"
    confidence = 80
    evidence = "Onsite only language"
  }
  return { eligibility, confidence, evidence, timezoneRequirements: timezoneMatch ? timezoneMatch[0].slice(0,200) : undefined, travelRequirements: /travel.*\d+%/.test(lower) ? "Travel required" : undefined, asyncFlexibility: /async|asynchronous|flexible schedule/i.test(lower), sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-v1" }
}
