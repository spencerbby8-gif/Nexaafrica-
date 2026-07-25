import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { aiGateway } from "../gateway"

export async function verifyCompanyLegitimacyAI(job: Job) {
  const now = new Date().toISOString()
  let jobPageText = ""
  let companyPageText = ""
  let sourceUrls: string[] = [job.apply_url]

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(job.apply_url, {
      headers: { "User-Agent": "Nexa Company Verifier" },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) {
      const html = await res.text()
      jobPageText = cleanDescription(html).slice(0, 4000)
    }
  } catch {}

  // Try to infer company website from apply_url host
  let companyDomain: string | null = null
  try {
    const url = new URL(job.apply_url)
    // For ATS hosts, company website is not the ATS host, so we need to search
    if (!url.hostname.includes("greenhouse.io") && !url.hostname.includes("lever.co") && !url.hostname.includes("ashbyhq.com")) {
      companyDomain = `${url.protocol}//${url.hostname}`
      sourceUrls.push(companyDomain)
    }
  } catch {}

  const combined = `${job.description_md}\n\n${jobPageText}`.slice(0, 6000)

  const prompt = `Verify company legitimacy for this job.

Company: ${job.company}
Has Logo: ${!!job.company_logo}
Apply URL: ${job.apply_url}
Company Domain Guess: ${companyDomain || "unknown"}
Description (first 2000 chars): ${combined.slice(0,2000)}

Check:
- Does company have website with same domain as apply URL or known ATS?
- Does it have logo?
- Any scam signals: pay to apply, buy kit, WhatsApp/Telegram apply, unrealistic?
- Is it in curated list of known remote companies? (GitLab, Stripe, etc are verified)
- Is it likely legit, verified, unknown, or suspicious?

Return JSON only:
{
  "legitimacy": "verified|likely_legit|unknown|suspicious",
  "confidence": 0-100,
  "evidence": "verbatim quote max 200 chars from job page or company page",
  "reason": "why this verdict"
}`

  try {
    const gwResult = await aiGateway({
      prompt,
      systemInstruction: "You are a company legitimacy verifier. Be evidence-based, never guess. Return UNKNOWN when evidence missing. Provide verbatim evidence quote.",
      agentId: "verifier:company-legitimacy",
      jobId: job.id,
      temperature: 0.2,
      maxTokens: 400,
    })

    const text = gwResult.response.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        legitimacy: parsed.legitimacy || "unknown",
        confidence: parsed.confidence || 20,
        evidence: (parsed.evidence || "").slice(0, 200),
        reason: parsed.reason || "",
        sourceUrls,
        lastVerified: now,
        modelVersion: `${gwResult.response.provider}:${gwResult.response.model}`,
      }
    }
  } catch (e) {
    console.warn(`[Company Verifier] AI failed, fallback: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Fallback rule-based
  const hasLogo = !!job.company_logo
  const hasTrustedAts = job.apply_url.includes("greenhouse.io") || job.apply_url.includes("lever.co") || job.apply_url.includes("ashbyhq.com")
  let legitimacy: "verified" | "likely_legit" | "unknown" | "suspicious" = "unknown"
  let confidence = 20
  let evidence = "No logo nor trusted ATS"
  if (hasLogo && hasTrustedAts) {
    legitimacy = "verified"
    confidence = 85
    evidence = `Logo + trusted ATS`
  } else if (hasTrustedAts) {
    legitimacy = "likely_legit"
    confidence = 70
    evidence = `ATS apply ${companyDomain || job.apply_url}`
  } else if (hasLogo) {
    legitimacy = "likely_legit"
    confidence = 60
    evidence = "Company logo present"
  }

  const lower = combined.toLowerCase()
  if (/pay.*to.*apply|buy.*kit|telegram.*apply|whatsapp.*apply/i.test(lower)) {
    legitimacy = "suspicious"
    confidence = 90
    evidence = "Scam pattern detected"
  }

  return {
    legitimacy,
    confidence,
    evidence,
    sourceUrls,
    lastVerified: now,
    modelVersion: "rule-based-fallback",
  }
}

export const verifyCompanyLegitimacyReal = verifyCompanyLegitimacyAI
