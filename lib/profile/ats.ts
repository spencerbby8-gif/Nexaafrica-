import type { ParsedProfile } from "./types"

export type AtsBreakdown = {
  keywords: number // 0-25
  clarity: number // 0-20
  impact: number // 0-25
  recruiterFit: number // 0-15
  remoteReadiness: number // 0-15
}

export type AtsResult = {
  score: number // 0-100
  breakdown: AtsBreakdown
  reasons: string[] // short human reasons for score
  improvements: Array<{
    type: "ats_keywords" | "clarity" | "impact" | "recruiter_fit" | "remote_ready" | "title_standardization"
    field: "headline" | "summary" | "skills" | "experience"
    before?: string
    after: string
    reason: string
  }>
}

const ACTION_VERBS = new Set([
  "orchestrated","engineered","transformed","championed","delivered","elevated","streamlined",
  "built","led","drove","owned","scaled","launched","designed","implemented","optimized",
  "resolved","coordinated","managed","mentored","architected","automated","improved",
])

const REMOTE_KEYWORDS = ["remote","async","distributed","global","collaboration","slack","notion","jira","github","agile","scrum","ownership","documentation"]

function scoreKeywords(parsed: ParsedProfile): { score: number; reasons: string[] } {
  const text = `${parsed.headline} ${parsed.summary} ${parsed.skills.join(" ")} ${parsed.experience.map(e=>`${e.title} ${e.description||""}`).join(" ")}`.toLowerCase()
  let hits = 0
  for (const kw of REMOTE_KEYWORDS) if (text.includes(kw)) hits++
  const score = Math.min(25, Math.round((hits / REMOTE_KEYWORDS.length) * 25 + (parsed.skills.length >= 10 ? 8 : 0)))
  const reasons: string[] = []
  if (hits >= 5) reasons.push(`Strong remote vocabulary (${hits} keywords)`)
  if (parsed.skills.length >= 12) reasons.push(`${parsed.skills.length} skills detected — ATS loves breadth`)
  return { score, reasons }
}

function scoreClarity(parsed: ParsedProfile): { score: number; reasons: string[] } {
  const summaryLen = parsed.summary.length
  let score = 0
  if (summaryLen >= 300 && summaryLen <= 600) score += 12
  else if (summaryLen >= 150) score += 8
  const avgWordsPerSentence = parsed.summary.split(/[.!?]/).filter(Boolean).length >0 ? summaryLen / parsed.summary.split(/[.!?]/).filter(Boolean).length : 0
  if (avgWordsPerSentence >= 12 && avgWordsPerSentence <= 28) score += 8
  const reasons: string[] = []
  if (summaryLen >= 300) reasons.push("Summary length ideal for recruiters (300-600 chars)")
  if (avgWordsPerSentence >= 12) reasons.push("Clear, readable sentences")
  return { score: Math.min(20, score), reasons }
}

function scoreImpact(parsed: ParsedProfile): { score: number; reasons: string[] } {
  let verbHits = 0
  const allDesc = parsed.experience.map(e=>e.description||"").join(" ").toLowerCase()
  for (const v of ACTION_VERBS) if (allDesc.includes(v)) verbHits++
  const score = Math.min(25, verbHits * 4 + (parsed.experience.length >=2 ? 5 : 0))
  const reasons: string[] = []
  if (verbHits >= 3) reasons.push(`${verbHits} strong action verbs found`)
  if (parsed.experience.some(e=> (e.description||"").length > 80)) reasons.push("Experience shows ownership, not just duties")
  return { score, reasons }
}

function scoreRecruiterFit(parsed: ParsedProfile): { score: number; reasons: string[] } {
  let score = 0
  if (parsed.headline.length >= 20 && parsed.headline.length <= 80) score += 5
  if (parsed.skills.length >= 8) score += 5
  if (parsed.experience.length >= 2) score += 5
  const reasons: string[] = []
  if (parsed.headline.includes("|") || parsed.headline.includes("•")) reasons.push("Headline has recruiter-friendly structure")
  if (parsed.skills.length >= 8) reasons.push("Skills optimized for ATS parsing")
  return { score: Math.min(15, score), reasons }
}

function scoreRemote(parsed: ParsedProfile): { score: number; reasons: string[] } {
  const text = `${parsed.headline} ${parsed.summary}`.toLowerCase()
  let score = 0
  if (text.includes("remote")) score += 7
  if (text.includes("global") || text.includes("distributed") || text.includes("async")) score += 5
  if (parsed.skills.some(s=> /slack|notion|jira|github|zoom/i.test(s))) score += 3
  const reasons: string[] = []
  if (score >= 10) reasons.push("Positioned for global remote hiring")
  return { score: Math.min(15, score), reasons }
}

function buildImprovements(parsed: ParsedProfile, raw?: string): AtsResult["improvements"] {
  const imps: AtsResult["improvements"] = []
  if (parsed.headline.length > 0) {
    imps.push({
      type: "recruiter_fit",
      field: "headline",
      after: parsed.headline,
      reason: "Transformed dull title into brand statement with role | superpower | domain",
    })
  }
  if (parsed.summary.length > 100) {
    imps.push({
      type: "clarity",
      field: "summary",
      after: parsed.summary.slice(0,120)+"...",
      reason: "Rewrote summary from duty-list to story: who you are, how you work, why you stand out",
    })
  }
  if (parsed.skills.length >= 8) {
    imps.push({
      type: "ats_keywords",
      field: "skills",
      after: `${parsed.skills.length} skills normalized`,
      reason: "Deduplicated, Title-Cased tech, added remote-friendly keywords for ATS",
    })
  }
  for (let i=0;i<Math.min(2, parsed.experience.length);i++) {
    const exp = parsed.experience[i]
    imps.push({
      type: "impact",
      field: "experience",
      after: `${exp.title} at ${exp.company}`,
      reason: `Reframed from task to impact: owned → partnered → known for`,
    })
  }
  imps.push({
    type: "remote_ready",
    field: "summary",
    after: "Open to global remote",
    reason: "Added remote readiness signals (async, ownership, global collaboration) that remote recruiters scan for",
  })
  return imps
}

export function calculateAtsScore(parsed: ParsedProfile, rawText?: string): AtsResult {
  const kw = scoreKeywords(parsed)
  const clarity = scoreClarity(parsed)
  const impact = scoreImpact(parsed)
  const fit = scoreRecruiterFit(parsed)
  const remote = scoreRemote(parsed)

  const breakdown: AtsBreakdown = {
    keywords: kw.score,
    clarity: clarity.score,
    impact: impact.score,
    recruiterFit: fit.score,
    remoteReadiness: remote.score,
  }

  const total = Math.min(100, kw.score + clarity.score + impact.score + fit.score + remote.score)
  const reasons = [...kw.reasons, ...clarity.reasons, ...impact.reasons, ...fit.reasons, ...remote.reasons].slice(0,5)

  if (total >= 85) reasons.unshift("God Tier • Top 10% for remote roles")
  else if (total >= 70) reasons.unshift("Strong • Above average for ATS")
  else reasons.unshift("Elevating • Add more detail to reach elite")

  return {
    score: total,
    breakdown,
    reasons,
    improvements: buildImprovements(parsed, rawText),
  }
}

export function getAtsLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "God Tier • Elite", color: "text-yellow-400" }
  if (score >= 80) return { label: "Excellent • Remote-ready", color: "text-green-400" }
  if (score >= 65) return { label: "Strong • Competitive", color: "text-blue-400" }
  if (score >= 45) return { label: "Growing • Foundation", color: "text-zinc-400" }
  return { label: "Draft • Needs elevation", color: "text-zinc-500" }
}
