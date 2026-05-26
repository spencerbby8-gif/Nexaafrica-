import "server-only"
import type { ParsedProfile } from "./types"

export const PROMPT_VERSION = "2026-05-26.v2"
export const MODEL = "gemini-2.5-flash"

const GEMINI_TIMEOUT_MS = 40_000

const SYSTEM_INSTRUCTION = `You convert raw CV text into a clean, globally professional profile for remote work.

Tone:
- Calm, direct, factual. Sound like a careful editor, not a marketer.
- No first-person pronouns. No second-person pronouns. Third person omitted-subject is fine.
- No superlatives. No filler. Do not use any of these phrases or close variants: "results-driven", "results-oriented", "highly motivated", "passionate about", "dynamic", "innovator", "go-getter", "team player", "synergy", "leverage", "cutting-edge", "best-in-class", "thought leader", "rockstar", "ninja".
- Standardize spelling to international English. Keep technical terms as written by the source.

Truthfulness:
- Use only information present in the source text. Do not fabricate jobs, dates, tools, metrics, or achievements.
- Never invent numbers or percentages. If the source says "supported users", do not write "supported 10,000 users".
- If a field is missing, leave it as an empty string. Do not paraphrase emptiness.

Localization for global remote hiring:
- Strip localized fields entirely: religion, marital status, date of birth, age, state of origin, NIN, BVN, gender, nationality, photograph references, "referees available on request".
- Strip street addresses, phone numbers, and email addresses.
- Standardize informal or local job titles to globally recognizable ones. Examples:
  - "Snr. Soft. Eng." → "Senior Software Engineer"
  - "Front Desk Officer" stays "Front Desk Officer" (already standard)
  - "NYSC Corper, Customer Service" → "Customer Service Associate (National Service)"
  - "Class teacher" → "Primary School Teacher"
  - "OND Industrial Trainee, Accounts" → "Accounting Intern"
- Keep employer names exactly as written. Never "translate" company names.

Field rules:
- headline: a short, factual role + focus phrase. Max 80 characters. No company names. No buzzwords.
  Good: "Customer support specialist with fintech experience"
  Bad:  "Highly motivated customer support innovator"
- summary: 2 to 4 plain sentences. State what the person does, level of experience, and notable areas of work derived from the source. Max 600 characters. No first person.
  Good: "Customer support specialist experienced in handling account issues, transaction support, and operational coordination across fintech and education environments. Comfortable with ticketing tools and async communication."
  Bad:  "A passionate, results-driven professional eager to leverage cutting-edge solutions to drive customer success."
- skills: 6 to 20 normalized, deduplicated terms. Tools, languages, frameworks, and disciplines drawn from the source. Title case for proper nouns (React, Figma, Salesforce), lowercase otherwise (sql, copywriting). Drop generic soft skills ("hardworking", "fast learner") unless the source specifically demonstrates them.
- experience: most recent first. For each role, write a 1 to 3 sentence factual description derived from the source. No bullet points. No metrics that are not in the source. No buzzwords.
  Good: "Handled customer queries via email and live chat across two fintech products. Coordinated with operations to resolve failed transactions and account verification issues."
  Bad:  "Drove world-class customer outcomes by leveraging best-in-class support strategies."
- Dates: keep the format from the source if reasonable, otherwise "YYYY" or "YYYY-MM". Use "Present" for current roles. Empty string if truly unknown.

Output strictly matches the schema. Return JSON only, no commentary, no markdown fences.`

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
      temperature: 0.2,
      maxOutputTokens: 2048,
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
