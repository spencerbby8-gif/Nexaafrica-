/**
 * Cerebras CV Reviewer — second-stage elevation engine.
 *
 * Takes a CV that has been structured by Gemini (primary transform) and
 * elevates it to a premium ATS-ready standard using Cerebras GPT-OSS 120B.
 *
 * THE CONTRACT:
 *   - The raw CV text is the single source of truth.
 *   - Every improvement must be cross-referenceable against the raw text.
 *   - Never invent experience, skills, dates, certifications, or achievements.
 *   - If the raw text doesn't support a change, revert to Gemini's version.
 *   - Focus on: tightening wording, strengthening impact verbs, improving
 *     keyword coverage for ATS scanning, normalizing formatting, and
 *     polishing clarity without adding false claims.
 */

import type { ParsedProfile } from "./types"

const REVIEW_PROMPT = `You are Nexa Elite — a premium CV reviewer powered by Cerebras. You receive a CV that Gemini has already structured from raw text. Your job is to elevate it further while preserving 100% factual accuracy.

=== IRON RULES ===
1. FACTUAL GUARD: The RAW CV TEXT is the single source of truth. Before changing ANY claim (job title, company, skill, date, achievement descriptor), verify it exists in the raw text. If a Gemini interpretation is plausible but the raw text doesn't explicitly support it, KEEP the Gemini version rather than rewriting unsupported territory.
2. NEVER INVENT: No fabricated metrics, percentages, team sizes, revenue figures, awards, certifications, degrees, or technologies.
3. NO LOCAL DIMINUTIVES: If Gemini missed any religion, marital status, DOB, age, state of origin, LGA, NIN, BVN, gender, nationality, photo refs, home address, phone, or email — REMOVE them now.
4. TIGHTEN, DON'T ADD: Reduce word count where possible. Cut filler. Make every sentence earn its space. If a sentence can be 12 words instead of 18 without losing meaning, do it.

=== ELEVATION GUIDELINES ===
- headline: [Role] | [Superpower + Domain], max 80 chars. Impactful, specific. No company names.
- summary: 3-4 tight sentences, 250-500 chars. Opens with core identity, closes with remote-readiness or differentiator. Every sentence advances the narrative — no filler.
- skills: 12-24 terms. Title Case for tech (React, PostgreSQL), lowercase for crafts (customer support, stakeholder management). Deduplicate. Order by relevance/strength, not alphabetically. Add ATS-friendly synonyms IF the raw text supports them (e.g., if raw says "managed servers", "Infrastructure Management" is valid; don't add "Docker" unless raw mentions it).
- experience: Each role gets 2-3 sentences in STAR-like prose (no bullet points, no metrics you don't have):
  1. What you owned, led, or delivered (strong action verb + scope)
  2. How you operated, who you worked with, what improved
  3. (optional) Outcome or reputation — only if supported by raw text
  Action verbs: Orchestrated, Engineered, Transformed, Championed, Delivered, Elevated, Streamlined, Architected, Scaled, Modernized, Optimized, Led, Owned.
- dates: Preserve exactly as Gemini output. "Present" for current roles.

=== ATS OPTIMIZATION ===
- Include relevant industry keywords naturally (not stuffed).
- Standardize common role titles for recruiter search: "Snr Dev" → "Senior Developer", "Proj Mgr" → "Project Manager".
- Ensure consistent formatting across all entries.

Output strictly JSON matching this exact structure:
{"headline":"...","summary":"...","skills":["...","..."],"experience":[{"title":"...","company":"...","start_date":"...","end_date":"...","description":"..."}]}
No markdown. No commentary. JSON only.`

export interface ReviewResult {
  parsed: ParsedProfile
  applied: boolean
  changes: { field: string; before: string; after: string }[]
}

export async function reviewCVWithCerebras(
  parsed: ParsedProfile,
  rawCvText: string,
): Promise<ReviewResult> {
  const apiKey = process.env.CEREBRAS_API_KEY
  if (!apiKey) {
    return { parsed, applied: false, changes: [] }
  }

  const geminiOutput = JSON.stringify({
    headline: parsed.headline,
    summary: parsed.summary,
    skills: parsed.skills,
    experience: parsed.experience,
  })

  const prompt = `${REVIEW_PROMPT}\n\n=== RAW CV TEXT (source of truth) ===\n"""\n${rawCvText.slice(0, 8000)}\n"""\n\n=== GEMINI OUTPUT (review and elevate this) ===\n${geminiOutput}\n\nReturn ONLY the elevated JSON.`

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
          {
            role: "system",
            content:
              "You are an elite CV reviewer. Output only valid JSON. Every change must be traceable to the raw CV text. Never invent facts.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn(
        `[Cerebras CV Review] API error ${res.status}: ${errText.slice(0, 200)}`,
      )
      return { parsed, applied: false, changes: [] }
    }

    const data = (await res.json()) as any
    const responseText = data.choices?.[0]?.message?.content || ""

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn("[Cerebras CV Review] No JSON found in response")
      return { parsed, applied: false, changes: [] }
    }

    let reviewed: any
    try {
      reviewed = JSON.parse(jsonMatch[0])
    } catch {
      console.warn("[Cerebras CV Review] JSON parse failed")
      return { parsed, applied: false, changes: [] }
    }

    // Validate required fields exist
    if (!reviewed.headline && !reviewed.experience?.length) {
      console.warn("[Cerebras CV Review] Response missing required fields")
      return { parsed, applied: false, changes: [] }
    }

    // Diff Gemini vs Cerebras to detect changes
    const changes: { field: string; before: string; after: string }[] = []
    if (reviewed.headline && reviewed.headline !== parsed.headline) {
      changes.push({ field: "headline", before: parsed.headline, after: reviewed.headline })
    }
    if (reviewed.summary && reviewed.summary !== parsed.summary) {
      changes.push({ field: "summary", before: parsed.summary.slice(0, 80) + "...", after: reviewed.summary.slice(0, 80) + "..." })
    }

    const skillsBefore = (parsed.skills || []).join(", ")
    const skillsAfter = Array.isArray(reviewed.skills) ? reviewed.skills.join(", ") : ""
    if (skillsAfter && skillsBefore !== skillsAfter) {
      changes.push({ field: "skills", before: skillsBefore.slice(0, 80), after: skillsAfter.slice(0, 80) })
    }

    const result: ParsedProfile = {
      headline: reviewed.headline || parsed.headline,
      summary: reviewed.summary || parsed.summary,
      skills: Array.isArray(reviewed.skills)
        ? reviewed.skills.filter((s: any) => typeof s === "string").map((s: string) => s.trim()).filter(Boolean)
        : parsed.skills,
      experience: Array.isArray(reviewed.experience)
        ? reviewed.experience
            .map((e: any) => ({
              title: e.title || "",
              company: e.company || "",
              start_date: e.start_date || null,
              end_date: e.end_date || null,
              description: e.description || null,
            }))
            .filter((e: any) => e.title && e.company)
        : parsed.experience,
    }

    return { parsed: result, applied: changes.length > 0, changes }
  } catch (e) {
    console.warn(
      `[Cerebras CV Review] Error:`,
      e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    )
    return { parsed, applied: false, changes: [] }
  }
}
