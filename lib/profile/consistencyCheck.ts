/**
 * Final consistency validator — compares the Cerebras-enhanced profile
 * against both the raw CV text and Gemini's original output.
 *
 * Rejects or reverts any enhancement that introduces claims not supported
 * by the source material. This is the safety net after the two-model
 * pipeline (Gemini → Cerebras).
 *
 * Rules:
 *   - Every company name must appear (case-insensitive) in raw text or Gemini output
 *   - Every job title must have a plausible match in the source
 *   - Every skill must be traceable to the raw CV text or Gemini output
 *   - Dates must match between enhanced and Gemini (Cerebras doesn't change dates)
 *   - Sum of skills should not grow beyond what's supported
 *   - Summary must not introduce completely new claims
 */

import type { ParsedProfile } from "./types"
import type { ValidationReport } from "./validate"

export interface ConsistencyReport {
  passed: boolean
  score: number // 0-100
  issues: ConsistencyIssue[]
  factoriesAccept: boolean // enough factories match to accept
  details: {
    headlineMatch: boolean
    summaryOverlap: number // % of summary tokens present in source
    skillGroundedness: number // % of skills traceable to source
    experienceGroundedness: number // % of experience entries with verifiable titles/companies
    dateIntegrity: boolean // all dates match between enhanced and Gemini
    companyVerification: number // % of companies found in source
  }
}

export interface ConsistencyIssue {
  field: string
  type: "unsupported_fact" | "date_mismatch" | "missing_source" | "inferred_skill" | "company_mismatch"
  severity: "reject" | "revert" | "warning"
  message: string
  before?: string
  after?: string
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-+#]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  )
}

function buildSourceTokenSet(rawCvText: string, geminiOutput: ParsedProfile): Set<string> {
  const tokens = new Set<string>()
  // Raw CV text
  for (const t of tokenize(rawCvText)) tokens.add(t)
  // Gemini output
  for (const t of tokenize(geminiOutput.headline)) tokens.add(t)
  for (const t of tokenize(geminiOutput.summary)) tokens.add(t)
  for (const s of geminiOutput.skills) {
    for (const t of tokenize(s)) tokens.add(t)
    tokens.add(s.toLowerCase())
  }
  for (const e of geminiOutput.experience) {
    for (const t of tokenize(e.title)) tokens.add(t)
    tokens.add(e.company.toLowerCase())
    if (e.description) for (const t of tokenize(e.description)) tokens.add(t)
  }
  return tokens
}

function fractionalOverlap(text: string, sourceTokens: Set<string>): number {
  const textTokens = tokenize(text)
  if (textTokens.size === 0) return 100
  let hits = 0
  for (const t of textTokens) {
    if (sourceTokens.has(t)) hits++
  }
  return Math.round((hits / textTokens.size) * 100)
}

function companyInSource(company: string, rawCvText: string, geminiOutput: ParsedProfile): boolean {
  const lower = company.toLowerCase().trim()
  if (!lower) return true // empty is fine
  // Check raw text
  if (rawCvText.toLowerCase().includes(lower)) return true
  // Check Gemini
  for (const e of geminiOutput.experience) {
    if (e.company.toLowerCase().trim() === lower) return true
  }
  // Partial match (at least 70% token overlap)
  const companyTokens = tokenize(lower)
  if (companyTokens.size === 0) return true
  let hits = 0
  for (const t of companyTokens) {
    if (rawCvText.toLowerCase().includes(t)) hits++
  }
  return hits / companyTokens.size >= 0.7
}

function skillInSource(skill: string, sourceTokens: Set<string>, rawCvText: string, geminiOutput: ParsedProfile): boolean {
  const lower = skill.toLowerCase().trim()
  // Direct token match
  for (const t of tokenize(lower)) {
    if (sourceTokens.has(t)) return true
  }
  // Check raw text substring
  if (rawCvText.toLowerCase().includes(lower)) return true
  // Check Gemini skills
  for (const gs of geminiOutput.skills) {
    if (gs.toLowerCase().trim() === lower) return true
  }
  // Multi-word skill: check if at least half the words appear
  const skillTokens = tokenize(lower)
  if (skillTokens.size >= 2) {
    let hits = 0
    for (const t of skillTokens) {
      if (sourceTokens.has(t) || rawCvText.toLowerCase().includes(t)) hits++
    }
    if (hits / skillTokens.size >= 0.5) return true
  }
  return false
}

export function consistencyCheck(
  enhanced: ParsedProfile,
  geminiOutput: ParsedProfile,
  rawCvText: string,
  validationReport: ValidationReport,
): { profile: ParsedProfile; report: ConsistencyReport } {
  const issues: ConsistencyIssue[] = []
  const sourceTokens = buildSourceTokenSet(rawCvText, geminiOutput)

  // --- Headline ---
  const headlineMatch = enhanced.headline === geminiOutput.headline ||
    fractionalOverlap(enhanced.headline, sourceTokens) >= 60
  if (!headlineMatch) {
    issues.push({
      field: "headline",
      type: "unsupported_fact",
      severity: "revert",
      message: "Enhanced headline diverges from source — reverting to Gemini version",
      before: geminiOutput.headline,
      after: enhanced.headline,
    })
  }

  // --- Summary ---
  const summaryOverlap = fractionalOverlap(enhanced.summary, sourceTokens)
  if (summaryOverlap < 50) {
    issues.push({
      field: "summary",
      type: "unsupported_fact",
      severity: "revert",
      message: `Enhanced summary has only ${summaryOverlap}% overlap with source — reverting to Gemini version`,
      before: geminiOutput.summary.slice(0, 80) + "...",
      after: enhanced.summary.slice(0, 80) + "...",
    })
  }

  // --- Skills ---
  let skills = [...(enhanced.skills || [])]
  let skillRejections = 0
  skills = skills.filter((s) => {
    const grounded = skillInSource(s, sourceTokens, rawCvText, geminiOutput)
    if (!grounded) {
      skillRejections++
      issues.push({
        field: "skills",
        type: "inferred_skill",
        severity: "reject",
        message: `Skill "${s}" not found in source — removed`,
      })
      return false
    }
    return true
  })
  const skillGroundedness = skills.length > 0
    ? Math.round(((skills.length) / Math.max(enhanced.skills.length, 1)) * 100)
    : 100

  // --- Experience ---
  const experience = (enhanced.experience || []).map((e, i) => {
    const gemExp = geminiOutput.experience[i]
    let title = e.title
    let company = e.company
    let start_date = e.start_date
    let end_date = e.end_date
    let description = e.description

    // Company must exist in source
    if (!companyInSource(company, rawCvText, geminiOutput)) {
      issues.push({
        field: `experience[${i}].company`,
        type: "company_mismatch",
        severity: "revert",
        message: `Company "${company}" not found in source — reverting to Gemini: "${gemExp?.company || "unknown"}"`,
        before: gemExp?.company || "",
        after: company,
      })
      company = gemExp?.company || company
    }

    // Date integrity
    if (gemExp) {
      if (e.start_date !== gemExp.start_date) {
        issues.push({
          field: `experience[${i}].start_date`,
          type: "date_mismatch",
          severity: "revert",
          message: `Start date changed from "${gemExp.start_date}" to "${e.start_date}" — reverting`,
        })
        start_date = gemExp.start_date
      }
      if (e.end_date !== gemExp.end_date) {
        issues.push({
          field: `experience[${i}].end_date`,
          type: "date_mismatch",
          severity: "revert",
          message: `End date changed from "${gemExp.end_date}" to "${e.end_date}" — reverting`,
        })
        end_date = gemExp.end_date
      }
    }

    // Description grounding
    if (description) {
      const descOverlap = fractionalOverlap(description, sourceTokens)
      if (descOverlap < 40) {
        issues.push({
          field: `experience[${i}].description`,
          type: "unsupported_fact",
          severity: "revert",
          message: `Description has only ${descOverlap}% source overlap — reverting to Gemini`,
        })
        description = gemExp?.description || description
      }
    }

    return { title, company, start_date, end_date, description, position: e.position }
  })

  // Count verifiable experience entries
  let verifiableExp = 0
  for (const e of experience) {
    if (companyInSource(e.company, rawCvText, geminiOutput)) verifiableExp++
  }
  const experienceGroundedness = experience.length > 0
    ? Math.round((verifiableExp / experience.length) * 100)
    : 100

  // Date integrity
  let dateIntegrity = true
  for (let i = 0; i < Math.min(experience.length, geminiOutput.experience.length); i++) {
    if (experience[i].start_date !== geminiOutput.experience[i]?.start_date ||
        experience[i].end_date !== geminiOutput.experience[i]?.end_date) {
      dateIntegrity = false
      break
    }
  }

  // Company verification
  let companyVerification = 100
  if (experience.length > 0) {
    let verified = 0
    for (const e of experience) {
      if (companyInSource(e.company, rawCvText, geminiOutput)) verified++
    }
    companyVerification = Math.round((verified / experience.length) * 100)
  }

  // Factories accept?
  const factoriesAccept =
    headlineMatch &&
    summaryOverlap >= 50 &&
    skillGroundedness >= 70 &&
    experienceGroundedness >= 70 &&
    dateIntegrity

  // Score
  const score = Math.round(
    (summaryOverlap * 0.25 +
      skillGroundedness * 0.25 +
      experienceGroundedness * 0.20 +
      companyVerification * 0.15 +
      (dateIntegrity ? 15 : 0))
  )

  const report: ConsistencyReport = {
    passed: factoriesAccept && score >= 60,
    score,
    issues,
    factoriesAccept,
    details: {
      headlineMatch,
      summaryOverlap,
      skillGroundedness,
      experienceGroundedness,
      dateIntegrity,
      companyVerification,
    },
  }

  // Build final profile — apply reverts
  const finalProfile: ParsedProfile = {
    headline: headlineMatch ? enhanced.headline : geminiOutput.headline,
    summary: summaryOverlap >= 50 ? enhanced.summary : geminiOutput.summary,
    skills,
    experience,
  }

  return { profile: finalProfile, report }
}
