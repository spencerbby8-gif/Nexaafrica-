import "server-only"
import type { ParsedProfile } from "./types"
import { aiGateway } from "@/lib/ai/gateway"

export const PROMPT_VERSION = "2026-07-23.god-tier-v1"
export const MODEL = "smart-router" // Now routed through Smart Router

const GATEWAY_TIMEOUT_MS = 45_000

const SYSTEM_INSTRUCTION = `You are Nexa God Tier — the world's best CV alchemist for African talent going global.

Your job is NOT to summarize a CV. Your job is to TRANSCEND it. Take raw, local, messy CV text and turn it into a profile so powerful the user says: "I'm elevated. This is magic. Wow I can't believe this is me."

This is not editing. This is elevation. This is transformation.

=== CORE PRINCIPLES ===

1. TRUTH, BUT ELEVATED: Never invent jobs, companies, dates, degrees, or numbers that aren't in source. But reframe everything that IS there in the most powerful, global, dignified language possible. "Handled customer queries" becomes "Orchestrated seamless customer support operations". Same truth, 10x impact.

2. NO LOCAL DIMINUTIVES: Strip anything that makes global recruiters discount African talent:
   - Remove: religion, marital status, DOB, age, state of origin, LGA, NIN, BVN, gender, nationality, photo refs, referees, full home address, phone, email
   - Standardize titles: "Snr Soft Eng" → "Senior Software Engineer", "NYSC Corper Customer Service" → "Customer Experience Associate (National Service)", "Class teacher" → "Primary Educator", "OND Trainee Accounts" → "Finance & Accounts Intern"
   - Keep company names exactly as written

3. VOICE: Confident, cinematic, human. Not corporate drone. Not buzzword soup. Write like a world-class biographer who respects this person. Use strong action verbs: Orchestrated, Engineered, Transformed, Championed, Delivered, Elevated, Streamlined.

4. NO FORBIDDEN PHRASES FROM OLD MODEL — new model allows power language. Avoid only the most hollow: "rockstar, ninja, synergy". But DO use: driven, impactful, strategic, etc. when earned.

=== FIELD RULES — GOD TIER ===

- headline: This is their personal brand in 1 line. Max 80 chars. Formula: [Role] | [Superpower] + [Domain]. Must make user feel seen.
  Bad (old calm): "Customer support specialist with fintech experience"
  Good (god tier): "Customer Support Specialist | Fintech Ops & Trust That Scales"
  Good: "Software Engineer | Building Products Users Feel"
  No company names.

- summary: 3-4 sentences that read like a movie trailer for this person. Sentence 1: Who they are at their core. Sentence 2: What they actually do / how they operate. Sentence 3: What makes them different / remote-ready superpower. Sentence 4 (optional): What they're known for.
  Must be 300-600 chars. Use vivid but truthful language. Make reader feel: this person is already global.

- skills: 12 to 24 terms, grouped by impact, normalized, deduplicated, Title Case for tech (React, Salesforce), lower for craft (customer support, copywriting). Order by strength, not alphabetically. Remove generic fluff like "hardworking" unless demonstrated. Include both hard and human skills.

- experience: Most recent first. For EACH role, 2-3 sentences that follow STAR but without inventing numbers:
  Sentence 1: What you owned / led / handled (strong verb + scope)
  Sentence 2: How you did it / who you worked with / what you improved
  Sentence 3 (optional): The outcome or what you became known for
  No bullet points. No metrics you don't have. But make every sentence feel like achievement.

- dates: Keep format from source if reasonable, else YYYY or YYYY-MM. Use "Present" for current. Empty if unknown.

=== MAGIC TOUCH ===
- You are not just formatting, you are dignifying. Every African professional has been underestimated by global hiring. Your job is to make their experience legible and respected globally.
- The final JSON should make the user screenshot it and say "wow".
- Output strictly JSON matching this schema, no markdown, no commentary:
{"headline":"string","summary":"string","skills":["string"],"experience":[{"title":"string","company":"string","start_date":"string","end_date":"string","description":"string"}]}

Return JSON only.`

export interface ParseResult {
  parsed: ParsedProfile
  tokensInput?: number
  tokensOutput?: number
  provider?: string
  model?: string
}

/**
 * Parse a CV using the Smart Router (goes through aiGateway).
 * The router selects the best provider for cv_parsing tasks,
 * with automatic failover to other providers.
 */
export async function parseCvWithGemini(rawText: string): Promise<ParseResult> {
  const trimmed = rawText.trim().slice(0, 18_000)

  const prompt = `Source CV text:\n"""\n${trimmed}\n"""\n\nReturn JSON matching the schema. Only JSON, no markdown.`

  // Route through the Smart Router via aiGateway
  // agentId "cv:parsing" triggers taskType detection → "cv_parsing"
  const gwResult = await aiGateway({
    prompt,
    systemInstruction: SYSTEM_INSTRUCTION,
    agentId: "cv:parsing",
    temperature: 0.75,
    maxTokens: 3000,
  })

  const text = gwResult.response.text
  if (!text) throw new Error("Empty response from model.")

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    const cleaned = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim()
    json = JSON.parse(cleaned)
  }

  const parsed = validateParsedProfile(json)

  console.log(JSON.stringify({
    scope: "cv_parsing",
    event: "parsed_success",
    provider: gwResult.response.provider,
    model: gwResult.response.model,
    latencyMs: gwResult.response.latencyMs,
    fallbackUsed: gwResult.fallbackUsed,
    tokensIn: gwResult.response.tokensInput,
    tokensOut: gwResult.response.tokensOutput,
  }))

  return {
    parsed,
    tokensInput: gwResult.response.tokensInput,
    tokensOutput: gwResult.response.tokensOutput,
    provider: gwResult.response.provider,
    model: gwResult.response.model,
  }
}

export function validateParsedProfile(input: unknown): ParsedProfile {
  if (!input || typeof input !== "object") throw new Error("Profile is not an object.")
  const obj = input as Record<string, unknown>

  const headline = typeof obj.headline === "string" ? obj.headline.trim() : ""
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : ""

  const skills = Array.isArray(obj.skills)
    ? obj.skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  const experience = Array.isArray(obj.experience)
    ? obj.experience
        .map((e): ParsedProfile["experience"][number] | null => {
          if (!e || typeof e !== "object") return null
          const r = e as Record<string, unknown>
          const title = typeof r.title === "string" ? r.title.trim() : ""
          const company = typeof r.company === "string" ? r.company.trim() : ""
          if (!title || !company) return null
          return {
            title,
            company,
            start_date: typeof r.start_date === "string" ? r.start_date.trim() : null,
            end_date: typeof r.end_date === "string" ? r.end_date.trim() : null,
            description: typeof r.description === "string" ? r.description.trim() : null,
          }
        })
        .filter((e): e is ParsedProfile["experience"][number] => e !== null)
    : []

  if (!headline && experience.length === 0) {
    throw new Error("Could not extract a headline or experience from this CV.")
  }

  return { headline, summary, skills, experience }
}
