import "server-only"
import type { ParsedProfile } from "./types"

export const PROMPT_VERSION = "2026-07-23.god-tier-v1"
export const MODEL = "gemini-2.5-flash"

const GEMINI_TIMEOUT_MS = 40_000

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
  Bad: "Customer support specialist experienced in handling account issues..."
  Good: "Customer support specialist who turns complex fintech moments into trust. Experienced across high-volume fintech and education environments, orchestrating account resolution, transaction operations, and cross-team coordination. Thrives in async, remote-first cultures where clear communication and ownership matter more than timezone."

- skills: 12 to 24 terms, grouped by impact, normalized, deduplicated, Title Case for tech (React, Salesforce), lower for craft (customer support, copywriting). Order by strength, not alphabetically. Remove generic fluff like "hardworking" unless demonstrated. Include both hard and human skills.

- experience: Most recent first. For EACH role, 2-3 sentences that follow STAR but without inventing numbers:
  Sentence 1: What you owned / led / handled (strong verb + scope)
  Sentence 2: How you did it / who you worked with / what you improved
  Sentence 3 (optional): The outcome or what you became known for
  No bullet points. No metrics you don't have. But make every sentence feel like achievement.
  Bad: "Handled customer queries via email and live chat across two fintech products."
  Good: "Orchestrated end-to-end support across two high-growth fintech products via email and live chat, becoming the go-to resolver for account verification and failed transactions. Partnered with operations and product to streamline resolution workflows and reduce repeat issues, known for calm ownership under pressure."

- dates: Keep format from source if reasonable, else YYYY or YYYY-MM. Use "Present" for current. Empty if unknown.

=== MAGIC TOUCH ===
- You are not just formatting, you are dignifying. Every African professional has been underestimated by global hiring. Your job is to make their experience legible and respected globally.
- The final JSON should make the user screenshot it and say "wow".
- Output strictly JSON matching schema, no markdown, no commentary.

Return JSON only.
`

export interface ParseResult {
  parsed: ParsedProfile
  tokensInput?: number
  tokensOutput?: number
}

export async function parseCvWithGemini(rawText: string): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("Server is missing GEMINI_API_KEY.")

  // Lazy-import so any bundling/runtime issue with @google/genai surfaces
  // inside the route's try/catch, not at module init (which would 500 the
  // request before our handler runs and read as "Failed to fetch" in the browser).
  const mod = await import("@google/genai")
  const GoogleGenAI = mod.GoogleGenAI
  const Type = mod.Type

  const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      summary: { type: Type.STRING },
      skills: { type: Type.ARRAY, items: { type: Type.STRING } },
      experience: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            company: { type: Type.STRING },
            start_date: { type: Type.STRING },
            end_date: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["title", "company", "start_date", "end_date", "description"],
        },
      },
    },
    required: ["headline", "summary", "skills", "experience"],
  }

  const trimmed = rawText.trim().slice(0, 18_000)

  const ai = new GoogleGenAI({ apiKey })

  // Hard timeout around the call. Without this, a slow Google socket can
  // exceed Vercel's `maxDuration` and the platform will close the connection
  // mid-flight — which the browser surfaces as "Failed to fetch".
  const callP = ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Source CV text:\n"""\n${trimmed}\n"""\n\nReturn JSON matching the schema.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.75,
      maxOutputTokens: 3000,
    },
  })

  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Gemini call timed out after ${GEMINI_TIMEOUT_MS}ms`)),
      GEMINI_TIMEOUT_MS,
    )
  })

  let result
  try {
    result = await Promise.race([callP, timeoutP])
  } finally {
    if (timer) clearTimeout(timer)
  }

  const text = result.text
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
  return {
    parsed,
    tokensInput: result.usageMetadata?.promptTokenCount,
    tokensOutput: result.usageMetadata?.candidatesTokenCount,
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
