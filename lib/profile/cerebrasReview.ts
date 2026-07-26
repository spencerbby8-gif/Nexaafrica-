/**
 * Cerebras CV Reviewer — second-stage elevation engine.
 *
 * Takes a CV that has been structured by Gemini (primary transform) and
 * elevates it to a premium ATS-ready standard. Cerebras GPT-OSS 120B is
 * used because it excels at structured rewriting while preserving facts.
 *
 * RULES:
 *   - Never invent experience, skills, dates, certifications, or achievements.
 *   - Every improvement must be supported by the original Gemini output.
 *   - Improve wording, clarity, impact, keyword coverage, formatting.
 *   - Preserve all factual information exactly.
 */

import type { ParsedProfile } from "./types"

const REVIEW_PROMPT = `You are Nexa Elite — a premium CV reviewer. You receive a structured CV that has already been transformed from raw text. Your job is to elevate it further to an ATS-optimized, recruiter-ready standard.

RULES:
1. NEVER invent jobs, companies, dates, skills, certifications, or achievements not in the source.
2. Improve wording clarity, impact, and keyword coverage (ATS-friendly terms).
3. Ensure consistent formatting — Title Case for role titles, proper capitalization for company names.
4. Condense verbose descriptions into impactful, action-oriented prose.
5. Ensure the headline follows [Role] | [Superpower + Domain] format (max 80 chars).
6. Ensure summary is 3-4 sentences, 300-600 chars, reads like a movie trailer.
7. Ensure skills are 12-24 normalized terms, Title Case for tech, sorted by impact.
8. Ensure experience descriptions use strong action verbs, follow STAR format implicitly.
9. Remove any remaining local diminutives (religion, marital status, DOB, age, photos, addresses).
10. Output strictly JSON matching the schema. No markdown. No commentary.`

export async function reviewCVWithCerebras(
  parsed: ParsedProfile,
  rawCvText: string,
): Promise<ParsedProfile> {
  const apiKey = process.env.CEREBRAS_API_KEY
  if (!apiKey) {
    // Cerebras not available — return original Gemini output unchanged
    return parsed
  }

  const input = JSON.stringify({
    headline: parsed.headline,
    summary: parsed.summary,
    skills: parsed.skills,
    experience: parsed.experience,
  })

  const prompt = `${REVIEW_PROMPT}\n\nSource CV (for fact-checking, do NOT use for generation):\n"""\n${rawCvText.slice(0, 8000)}\n"""\n\nGemini Structured Output (review and elevate this):\n${input}\n\nReturn JSON with the same structure: {"headline": "...", "summary": "...", "skills": [...], "experience": [{"title": "...", "company": "...", "start_date": "...", "end_date": "...", "description": "..."}]}`

  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-oss-120b",
        messages: [
          { role: "system", content: "You are an elite CV reviewer. Output only valid JSON. Never invent facts. Every improvement must reference the source material." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`[Cerebras CV Review] API error ${res.status}: ${errText.slice(0, 200)}`)
      return parsed // fall back to Gemini output
    }

    const data = await res.json() as any
    const text = data.choices?.[0]?.message?.content || ""

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[Cerebras CV Review] No JSON found in response")
      return parsed
    }

    const reviewed = JSON.parse(jsonMatch[0])

    // Validate the reviewed output has the required fields
    if (!reviewed.headline && !reviewed.experience?.length) {
      console.warn("[Cerebras CV Review] Response missing required fields")
      return parsed
    }

    return {
      headline: reviewed.headline || parsed.headline,
      summary: reviewed.summary || parsed.summary,
      skills: Array.isArray(reviewed.skills) ? reviewed.skills : parsed.skills,
      experience: Array.isArray(reviewed.experience)
        ? reviewed.experience.map((e: any) => ({
            title: e.title || "",
            company: e.company || "",
            start_date: e.start_date || null,
            end_date: e.end_date || null,
            description: e.description || null,
          }))
        : parsed.experience,
    }
  } catch (e) {
    console.warn(`[Cerebras CV Review] Error:`, e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200))
    return parsed // fall back to Gemini output
  }
}
