import "server-only"
import type { ParsedProfile } from "./types"

export const PROMPT_VERSION = "2026-05-21.v1"
export const MODEL = "gemini-2.5-flash"

const GEMINI_TIMEOUT_MS = 40_000

const SYSTEM_INSTRUCTION = `You convert raw CV text into a clean, globally professional profile for remote work.

Rules:
- Use only information present in the source text. Do not fabricate jobs, dates, tools, metrics, or achievements.
- If a field is missing, leave it as an empty string. Never invent.
- Strip localized fields: religion, marital status, date of birth, state of origin, NIN, gender, nationality, photograph references.
- Strip street addresses, phone numbers, and emails.
- Standardize job titles to globally recognizable names (for example, "Front Desk Officer" stays as "Front Desk Officer", but "Snr. Soft. Eng." becomes "Senior Software Engineer").
- Keep language calm, direct, and professional. No marketing language, no superlatives, no "results-driven" filler.
- Headline: short role + focus, max 80 characters. No company names.
- Summary: 2 to 4 plain sentences describing what the person does, their experience level, and notable areas of work. Max 600 characters. No first person pronouns.
- Skills: 6 to 20 normalized, deduplicated terms. Tools, languages, and disciplines. Title case for proper nouns, lowercase otherwise. No soft skills like "hardworking" unless clearly stated.
- Experience: most recent first. Description is 1 to 3 plain sentences derived from the source text, no bullet points, no metrics that are not in the source.
- Dates: keep the format from the source if reasonable, otherwise "YYYY" or "YYYY-MM". Use "Present" for current roles.
- Output strictly matches the schema. No commentary, no markdown.`

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
