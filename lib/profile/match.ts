import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/types'

/**
 * Lightweight, deterministic personalization for the signed-in homepage.
 *
 * No embeddings, no vectors, no ML. Just:
 *   - profile skills        (from profile_skills)
 *   - experience titles     (from profile_experience)
 *   - saved-job categories  (from saved_jobs join jobs)
 *
 * We blend those into a small signal set and score recent jobs against it.
 * The scoring is pure, fast, and easy to reason about.
 */

export interface MatchSignals {
  /** Lowercased canonical skill tokens. */
  skills: Set<string>
  /** Job categories the user has signaled interest in (from experience + saves). */
  categories: Set<string>
  /** Lowercased meaningful tokens from past experience titles. */
  titleTokens: Set<string>
  /** Saved job ids — excluded from suggestions so we don't recommend back. */
  savedJobIds: Set<string>
  /** True when at least one of skills/categories/titleTokens is non-empty. */
  hasSignal: boolean
}

const EMPTY_SIGNALS: MatchSignals = {
  skills: new Set(),
  categories: new Set(),
  titleTokens: new Set(),
  savedJobIds: new Set(),
  hasSignal: false,
}

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'into', 'from', 'this', 'that', 'are', 'was',
  'has', 'had', 'have', 'our', 'your', 'their', 'they', 'will', 'been',
  'senior', 'junior', 'lead', 'staff', 'principal', 'mid', 'level', 'iii', 'ii',
  'remote', 'onsite', 'hybrid', 'full', 'time', 'part', 'contract',
  'team', 'role', 'job', 'position', 'company',
])

/**
 * Map common title keywords to platform categories. Deliberately tiny &
 * deterministic — extend as inventory grows. Order matters: more specific
 * keywords listed first.
 */
const TITLE_TO_CATEGORY: Array<[RegExp, string]> = [
  [/\bvirtual\s*assistant\b|\bva\b/i, 'virtual-assistant'],
  [/\bdata\s*(label|annotat|tag)|\bai\s*(label|annotat|train)/i, 'ai-labeling'],
  [/\bcustomer\s*(support|success|service|experience)\b|\bsupport\s*(agent|specialist|engineer)\b/i, 'customer-support'],
  [/\b(software|backend|frontend|fullstack|full[- ]stack|web|mobile|devops|sre|platform|infrastructure)\s*engineer\b|\bengineer\b|\bdeveloper\b|\bprogrammer\b/i, 'engineering'],
  [/\bproduct\s*(manager|owner|lead|designer)\b|\bpm\b/i, 'product'],
  [/\bdesigner?\b|\bux\b|\bui\b/i, 'design'],
  [/\bmarketing\b|\bmarketer\b|\bgrowth\b|\bseo\b|\bcontent\s*(writer|strategist|marketer)\b/i, 'marketing'],
  [/\bsales\b|\baccount\s*executive\b|\bbusiness\s*development\b|\bbdr\b|\bsdr\b|\bae\b/i, 'sales'],
  [/\b(data|business)\s*(analyst|scientist|engineer)\b|\banalytics\b/i, 'data'],
  [/\boperations\b|\bops\b|\bproject\s*manager\b|\bprogram\s*manager\b/i, 'operations'],
  [/\bwriter\b|\beditor\b|\bcontent\b/i, 'marketing'],
  [/\brecruiter\b|\bpeople\b|\bhr\b|\btalent\b/i, 'operations'],
]

function inferCategoryFromTitle(title: string): string | null {
  for (const [re, cat] of TITLE_TO_CATEGORY) {
    if (re.test(title)) return cat
  }
  return null
}

function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !TITLE_STOPWORDS.has(t))
}

/**
 * Build the user's match signals. Returns EMPTY_SIGNALS when signed out or
 * when the profile has no usable data — callers should hide their UI in
 * that case so we never render a personalized section based on nothing.
 */
export async function getUserMatchSignals(): Promise<MatchSignals> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return EMPTY_SIGNALS

  const [skillsRes, expRes, savedRes] = await Promise.all([
    supabase.from('profile_skills').select('name').eq('profile_id', user.id),
    supabase
      .from('profile_experience')
      .select('title')
      .eq('profile_id', user.id),
    supabase
      .from('saved_jobs')
      .select('job_id, jobs!inner(category)')
      .eq('user_id', user.id),
  ])

  const skills = new Set<string>()
  for (const r of skillsRes.data ?? []) {
    const v = (r.name as string | null)?.trim().toLowerCase()
    if (v && v.length >= 2 && v.length <= 60) skills.add(v)
  }

  const categories = new Set<string>()
  const titleTokens = new Set<string>()
  for (const r of expRes.data ?? []) {
    const t = (r.title as string | null)?.trim()
    if (!t) continue
    const cat = inferCategoryFromTitle(t)
    if (cat) categories.add(cat)
    for (const tok of tokenizeTitle(t)) titleTokens.add(tok)
  }

  const savedJobIds = new Set<string>()
  for (const r of savedRes.data ?? []) {
    const id = (r as { job_id: string }).job_id
    if (id) savedJobIds.add(id)
    const cat = (r as unknown as { jobs: { category: string } }).jobs?.category
    if (cat) categories.add(cat)
  }

  const hasSignal =
    skills.size > 0 || categories.size > 0 || titleTokens.size > 0
  return { skills, categories, titleTokens, savedJobIds, hasSignal }
}

export interface MatchedJob {
  job: Job
  score: number
  reasons: string[]
}

/**
 * Score a single job against the signal set. Pure function — no I/O.
 *
 * Scoring weights are intentionally small integers so behavior is auditable.
 *   +5  category match            (strongest signal)
 *   +1  per skill match in tags   (capped at +5)
 *   +2  per title token in title  (capped at +4)
 *   +2  open-to-Africa            (platform-wide preference)
 *   +1  remote                    (mild boost)
 *   +1  fresh (<7d)               (mild boost)
 */
export function scoreJob(job: Job, signals: MatchSignals): MatchedJob | null {
  if (signals.savedJobIds.has(job.id)) return null

  let score = 0
  const reasons: string[] = []

  // Category match (the highest-confidence signal we have).
  const categoryMatched = signals.categories.has(job.category)
  if (categoryMatched) {
    score += 5
    reasons.push('Matches your experience')
  }

  // Skill overlap with job tags.
  const tagSet = new Set((job.tags ?? []).map((t) => t.toLowerCase()))
  let skillHits = 0
  for (const s of signals.skills) {
    if (tagSet.has(s)) skillHits++
    if (skillHits >= 5) break
  }
  if (skillHits > 0) {
    score += skillHits
    if (!categoryMatched) reasons.push('Matches your skills')
  }

  // Title overlap (substring tokens).
  const titleLower = job.title.toLowerCase()
  let titleHits = 0
  for (const tok of signals.titleTokens) {
    if (titleLower.includes(tok)) titleHits++
    if (titleHits >= 2) break
  }
  if (titleHits > 0) score += titleHits * 2

  // Africa-aligned boost — soft label only when nothing stronger fired.
  if (job.is_open_to_africa) {
    score += 2
    if (reasons.length === 0) reasons.push('Open to Africa')
  }
  if (job.is_remote) {
    score += 1
    if (reasons.length === 0) reasons.push('Remote-ready fit')
  }

  // [V2] Real listing-quality factors (all from persisted job data — never
  // fabricated): verified trust, salary disclosure, explicit Africa tier.
  const trustRaw = (job as any).trust_score
  if (typeof trustRaw === 'number' && trustRaw >= 60) {
    score += 2
    if (reasons.length === 0) reasons.push('Trusted listing')
  }
  if (job.salary_range) {
    score += 1
    if (reasons.length === 0) reasons.push('Salary disclosed')
  }
  if (job.eligibility === 'explicit') {
    score += 1
    if (reasons.length === 0) reasons.push('Explicitly open to Africa')
  }

  // Mild freshness nudge, based on the real posting date.
  const ageDays =
    (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000
  if (ageDays <= 7) score += 1

  if (score < 4) return null

  // Cap to two reasons — calm, restrained, no bullet-soup on cards.
  return { job, score, reasons: reasons.slice(0, 2) }
}

/**
 * Pull a recent candidate pool, score, and return the best matches.
 * Falls back to empty when there are no usable signals so the homepage
 * section can hide cleanly.
 */
export async function getMatchedJobs(
  signals: MatchSignals,
  limit = 6,
): Promise<MatchedJob[]> {
  if (!signals.hasSignal) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, employment_type, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at',
    )
    .eq('is_active', true)
    .not('eligibility', 'eq', 'restricted')
    // [REGION-LOCK] Matching Your Experience stays verified-only AND never
    // surfaces jobs the system marks as not open to Africa.
    .eq('is_open_to_africa', true)
    .order('posted_at', { ascending: false })
    .limit(200)

  if (error || !data) return []

  // [STABILIZATION] Matching Your Experience uses the newest VERIFIED jobs
  // only: AI rows from a real provider, never AI-restricted, never stale.
  let aiMap = new Map<string, any>()
  try {
    const { getAIIntelligenceForJobs } = await import('@/lib/ai/queries')
    aiMap = await getAIIntelligenceForJobs((data as Job[]).map((j) => j.id))
  } catch {}

  const scored: MatchedJob[] = []
  for (const j of data as Job[]) {
    const ai = aiMap.get(j.id)
    const mv = ai?.model_version || ''
    const isVerified = mv.includes(':') && !mv.startsWith('regex')
    if (!isVerified) continue // verified jobs only
    if (ai?.africa_eligibility === 'restricted') continue // never restricted
    const m = scoreJob(j, signals)
    if (m) scored.push(m)
  }
  // Stable sort: score desc, then newer first.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (
      new Date(b.job.posted_at).getTime() -
      new Date(a.job.posted_at).getTime()
    )
  })
  return scored.slice(0, limit)
}
