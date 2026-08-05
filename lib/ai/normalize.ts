/**
 * Truth Layer v1 — persistence-contract normalization.
 *
 * The single boundary where untrusted AI output becomes stored fact.
 * Used by: lib/ai/engine.ts (main upsert + second opinion persist),
 * app/api/ai/backfill/route.ts (skills/salary healing), and the fixture
 * harness. Pure: no env, no I/O.
 *
 * Proven production defects fixed here (audit 2026-08-05):
 *   - required_skills persisted as raw `{skill, evidence}` objects and
 *     rendered as JSON to users (second-opinion path skipped asStringArray;
 *     the main path DROPPED object entries entirely, losing real skills).
 *   - stored evidence carried markdown escape garbage ("\\*\\*5+ years…\\*\\*")
 *     presented as verbatim quotes.
 */

import { unescapeMarkdown } from "@/lib/geo/eligibility"

export const asInt = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

export const clamp100 = (v: unknown): number | null => {
  const n = asInt(v)
  if (n === null) return null
  return Math.max(0, Math.min(100, n))
}

export const asEnum = <T extends string>(v: unknown, allowed: readonly T[]): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : ("unknown" as T)

export const asStringOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null

/**
 * Skills list at the write boundary. Accepts strings AND model-emitted
 * objects ({skill|name|title: "…"}), normalizes each entry (whitespace
 * collapse, markdown unescape), dedupes case-insensitively (kills the
 * live "Finance, Finance" duplicates), caps count/length. Objects without
 * a usable string field are dropped — never serialized raw.
 */
export const asSkillList = (v: unknown, max = 25): string[] => {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of v) {
    let s: string | null = null
    if (typeof x === "string") s = x
    else if (x !== null && typeof x === "object") {
      const o = x as Record<string, unknown>
      s =
        (typeof o.skill === "string" && o.skill) ||
        (typeof o.name === "string" && o.name) ||
        (typeof o.title === "string" && o.title) ||
        null
    }
    if (!s) continue
    s = unescapeMarkdown(s).replace(/\s+/g, " ").trim()
    if (!s || s.length > 200) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** Back-compat alias — every former asStringArray callsite becomes skills-safe. */
export const asStringArray = asSkillList

/**
 * Evidence text at the write boundary: unescape markdown artifacts,
 * collapse whitespace, cap length. Returns null for unusable input.
 * Never synthesizes content — only cleans what a model actually returned.
 */
export const cleanEvidenceText = (v: unknown, maxLen = 600): string | null => {
  if (typeof v !== "string" || v.length === 0) return null
  const s = unescapeMarkdown(v).replace(/\s+/g, " ").trim()
  if (!s) return null
  return s.length > maxLen ? s.slice(0, maxLen) : s
}
