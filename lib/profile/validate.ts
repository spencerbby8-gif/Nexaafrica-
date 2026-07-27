/**
 * Validation layer — normalizes and verifies Gemini's structured output.
 *
 * Runs after Gemini parsing, before the Cerebras review. Produces a
 * normalized ParsedProfile and a ValidationReport that records:
 *   - date format normalization
 *   - skill deduplication and cleaning
 *   - required field checks
 *   - confidence indicators
 *
 * Never invents data — only cleans and flags what Gemini produced.
 */

import type { ParsedProfile, ProfileExperience } from "./types"

export interface ValidationReport {
  passed: boolean
  issues: ValidationIssue[]
  stats: {
    experienceCount: number
    skillCount: number
    skillsAdded: number
    skillsRemoved: number
    skillsNormalized: number
    datesNormalized: number
    headlineLength: number
    summaryLength: number
  }
  confidence: ValidationConfidence
}

export interface ValidationIssue {
  field: string
  severity: "error" | "warning" | "info"
  message: string
}

export interface ValidationConfidence {
  overall: number // 0-100
  headline: number
  summary: number
  skills: number
  experience: number
  reasons: string[]
}

// Local diminutives that must be stripped
const LOCAL_DIMINUTIVES = [
  /\b(nin|bvn)\b/i, /\bdate\s*of\s*birth\b/i, /\bmarital\s*status\b/i,
  /\bstate\s*of\s*origin\b/i, /\blocal\s*gov(?:ernment)?\s*area\b/i,
  /\breligion\b/i, /\bgender\b/i, /\bnationality\b/i,
  /\breferees?\b/i, /\bhome\s*address\b/i, /\bphone\s*(?:number|no)?\b/i,
  /\bphotograph\b/i, /\bpassport\b/i,
]

// Non-professional skill terms to remove
const FLUFF_SKILLS = new Set([
  "hardworking", "hard work", "hard worker", "team player", "punctual",
  "honest", "loyal", "dedicated", "committed", "passionate", "enthusiastic",
  "self-motivated", "self motivated", "fast learner", "quick learner",
  "ability to work under pressure", "ability to work in a team",
  "good communication skills", "excellent communication skills",
  "good interpersonal skills", "result oriented", "results oriented",
  "goal oriented", "goal getter", "attention to detail",
])

function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null
  const s = d.trim()
  // "Present" or "Current" → "Present"
  if (/^(present|current|now|today|ongoing)$/i.test(s)) return "Present"
  // YYYY-MM or YYYY/MM → YYYY-MM
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/)
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`
  // YYYY-MM-DD → YYYY-MM
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}`
  // Mon YYYY → YYYY-MM
  const monYr = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})$/i)
  if (monYr) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    const m = months.indexOf(monYr[1].toLowerCase().slice(0, 3))
    if (m >= 0) return `${monYr[2]}-${String(m + 1).padStart(2, "0")}`
  }
  // YYYY only
  if (/^\d{4}$/.test(s)) return s
  // Unknown/unrecognized — keep as-is
  return s
}

function stripDiminutives(text: string): { cleaned: string; removed: string[] } {
  const removed: string[] = []
  let cleaned = text
  for (const re of LOCAL_DIMINUTIVES) {
    const m = cleaned.match(re)
    if (m) {
      removed.push(m[0])
      cleaned = cleaned.replace(
        new RegExp(`.{0,80}${re.source}.{0,80}`, "gi"),
        (match) =>
          match
            .replace(re, "")
            .replace(/\s{2,}/g, " ")
            .trim(),
      )
    }
  }
  return { cleaned: cleaned.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim(), removed }
}

function normalizeSkill(s: string): string {
  let cleaned = s.trim()
  // Title Case for technical terms (detected by camelCase, hyphens, or common prefixes)
  if (/^[a-z]+[A-Z]/.test(cleaned) || /[A-Z]/.test(cleaned.slice(2))) {
    // Looks like a proper noun / tech term — preserve casing
  } else if (cleaned.length <= 3) {
    cleaned = cleaned.toUpperCase()
  } else {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
  return cleaned
}

export function validateGeminiOutput(
  parsed: ParsedProfile,
  rawCvText: string,
): { profile: ParsedProfile; report: ValidationReport } {
  const issues: ValidationIssue[] = []
  let datesNormalized = 0
  let skillsNormalized = 0
  let skillsRemoved = 0
  let skillsAdded = 0

  // --- Headline ---
  let headline = (parsed.headline || "").trim()
  const hd = stripDiminutives(headline)
  headline = hd.cleaned
  for (const r of hd.removed) {
    issues.push({ field: "headline", severity: "info", message: `Removed local diminutive: "${r}"` })
  }
  if (headline.length > 80) {
    headline = headline.slice(0, 80)
    issues.push({ field: "headline", severity: "warning", message: "Headline truncated to 80 characters" })
  }
  if (!headline) {
    issues.push({ field: "headline", severity: "error", message: "Headline is empty" })
  }

  // --- Summary ---
  let summary = (parsed.summary || "").trim()
  const sd = stripDiminutives(summary)
  summary = sd.cleaned
  for (const r of sd.removed) {
    issues.push({ field: "summary", severity: "info", message: `Removed local diminutive: "${r}"` })
  }
  if (summary.length < 200) {
    issues.push({ field: "summary", severity: "warning", message: `Summary is short (${summary.length} chars, target 300-600)` })
  }

  // --- Skills ---
  let skills = (parsed.skills || [])
    .map((s) => s.trim())
    .filter(Boolean)
  const beforeSkillCount = skills.length

  // Remove fluff
  skills = skills.filter((s) => {
    const lower = s.toLowerCase()
    if (FLUFF_SKILLS.has(lower)) {
      skillsRemoved++
      issues.push({ field: "skills", severity: "info", message: `Removed non-professional skill: "${s}"` })
      return false
    }
    return true
  })

  // Normalize casing
  skills = skills.map((s) => {
    const normalized = normalizeSkill(s)
    if (normalized !== s) skillsNormalized++
    return normalized
  })

  // Deduplicate (case-insensitive)
  const seen = new Set<string>()
  skills = skills.filter((s) => {
    const lower = s.toLowerCase()
    if (seen.has(lower)) { skillsRemoved++; return false }
    seen.add(lower)
    return true
  })

  // Pad if too few skills
  if (skills.length < 8 && rawCvText.length > 0) {
    // Extract any obvious skills from raw text that Gemini might have missed
    const rawLower = rawCvText.toLowerCase()
    const commonTechSkills = [
      "Microsoft Office", "Microsoft Excel", "Google Workspace", "Team Leadership",
      "Project Management", "Customer Service", "Data Entry", "Administrative Support",
      "Communication", "Problem Solving", "Time Management", "Critical Thinking",
    ]
    for (const cs of commonTechSkills) {
      if (skills.length >= 8) break
      if (rawLower.includes(cs.toLowerCase()) && !seen.has(cs.toLowerCase())) {
        skills.push(cs)
        seen.add(cs.toLowerCase())
        skillsAdded++
      }
    }
    if (skills.length < 8) {
      issues.push({ field: "skills", severity: "warning", message: `Only ${skills.length} skills extracted (target 12-24)` })
    }
  }

  if (skills.length === 0) {
    issues.push({ field: "skills", severity: "error", message: "No skills extracted" })
  }

  // --- Experience ---
  const experience: ProfileExperience[] = (parsed.experience || [])
    .filter((e) => e.title && e.company)
    .map((e) => {
      const ed = stripDiminutives(e.description || "")
      let title = e.title.trim()
      let description = ed.cleaned
      let company = e.company.trim()

      // Normalize dates
      let start_date = normalizeDate(e.start_date)
      let end_date = normalizeDate(e.end_date)
      if (start_date !== (e.start_date || null) || end_date !== (e.end_date || null)) {
        datesNormalized++
      }

      for (const r of ed.removed) {
        issues.push({ field: `experience.${title}`, severity: "info", message: `Removed local diminutive: "${r}"` })
      }

      return { title, company, start_date, end_date, description, position: e.position }
    })

  if (experience.length === 0) {
    issues.push({ field: "experience", severity: "error", message: "No experience entries extracted" })
  }

  // --- Confidence ---
  const headlineConf = headline.length >= 20 && headline.length <= 80 ? 90 : headline.length > 0 ? 60 : 0
  const summaryConf = summary.length >= 300 ? 90 : summary.length >= 200 ? 70 : summary.length > 0 ? 40 : 0
  const skillsConf = skills.length >= 12 ? 95 : skills.length >= 8 ? 75 : skills.length > 0 ? 50 : 0
  const experienceConf = experience.length >= 3 ? 90 : experience.length >= 1 ? 70 : 0

  const reasons: string[] = []
  if (headlineConf >= 80) reasons.push("Strong headline")
  if (summaryConf >= 80) reasons.push("Rich summary")
  if (skillsConf >= 80) reasons.push("Comprehensive skills")
  if (experienceConf >= 80) reasons.push("Detailed experience")

  const confidence: ValidationConfidence = {
    overall: Math.round((headlineConf + summaryConf + skillsConf + experienceConf) / 4),
    headline: headlineConf,
    summary: summaryConf,
    skills: skillsConf,
    experience: experienceConf,
    reasons,
  }

  const errors = issues.filter((i) => i.severity === "error")

  const report: ValidationReport = {
    passed: errors.length === 0 && confidence.overall >= 40,
    issues,
    stats: {
      experienceCount: experience.length,
      skillCount: skills.length,
      skillsAdded,
      skillsRemoved,
      skillsNormalized,
      datesNormalized,
      headlineLength: headline.length,
      summaryLength: summary.length,
    },
    confidence,
  }

  return {
    profile: { headline, summary, skills, experience },
    report,
  }
}
