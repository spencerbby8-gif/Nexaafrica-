/**
 * Intelligence Ranking Engine
 *
 * Multi-factor ranking for verified jobs. Replaces raw date-order with a
 * composite score that surfaces the freshest, most trustworthy, most
 * Africa-eligible, best-paid, fully-remote jobs first.
 *
 * Factors and weights (total 100):
 *   Freshness (verification recency)   20
 *   Africa eligibility tier            20
 *   Verification confidence            15
 *   Trust score (listing legitimacy)   10
 *   Salary quality                     10
 *   Remote quality                      8
 *   Hiring activity (company)           7
 *   Posting recency                     5
 *   User profile match bonus            5  (added in PersonalizedFeed)
 */

import type { Job } from '@/lib/types'
import type { JobAIIntelligenceRow } from '@/lib/ai/queries'

export interface RankedJob {
  job: Job & { aiIntelligence?: JobAIIntelligenceRow | null }
  rankScore: number
  rankFactors: {
    freshness: number
    africa: number
    confidence: number
    trust: number
    salary: number
    remote: number
    hiring: number
    recency: number
  }
}

export function rankJob(
  job: Job & { aiIntelligence?: JobAIIntelligenceRow | null },
  companyJobCount?: number,
): RankedJob {
  const ai = job.aiIntelligence
  const now = Date.now()

  // 1. Freshness — how recently AI verified this job (0-20)
  const verifiedMs = ai?.last_verified_at ? now - new Date(ai.last_verified_at).getTime() : Infinity
  const verifiedHrs = verifiedMs / (60 * 60 * 1000)
  let freshness = 20
  if (verifiedHrs > 72) freshness = 5
  else if (verifiedHrs > 24) freshness = 10
  else if (verifiedHrs > 6) freshness = 15

  // 2. Africa eligibility tier (0-20)
  const elig = ai?.africa_eligibility || (job as any).eligibility || 'unknown'
  const africa = elig === 'explicit' ? 20 : elig === 'likely' ? 15 : elig === 'unknown' ? 8 : 0

  // 3. Verification confidence (0-15)
  const confidence = ai?.overall_confidence != null ? Math.round((ai.overall_confidence / 100) * 15) : 3

  // 4. Trust score (0-10)
  const trustRaw = (job as any).trust_score
  const trust = typeof trustRaw === 'number' ? Math.round((trustRaw / 100) * 10) : 5

  // 5. Salary quality (0-10)
  const salTrans: string = ai?.salary_transparency || ((job as any).salary_range ? 'disclosed' : 'unknown')
  const salary = salTrans === 'disclosed' ? 10 : salTrans === 'estimated' ? 7 : 3

  // 6. Remote quality (0-8)
  const remoteElig = ai?.remote_eligibility
  const remote = remoteElig === 'fully_remote' ? 8 : remoteElig === 'hybrid' ? 5 : (job as any).is_remote ? 6 : 2

  // 7. Hiring activity (0-7)
  const hiring = companyJobCount != null && companyJobCount > 0
    ? Math.min(7, Math.round(companyJobCount / 5))
    : 2

  // 8. Posting recency (0-5)
  const postedMs = (job as any).posted_at ? now - new Date((job as any).posted_at).getTime() : Infinity
  const postedDays = postedMs / (24 * 60 * 60 * 1000)
  let recency = 5
  if (postedDays > 30) recency = 1
  else if (postedDays > 14) recency = 2
  else if (postedDays > 7) recency = 3

  const rankScore = freshness + africa + confidence + trust + salary + remote + hiring + recency

  return {
    job,
    rankScore,
    rankFactors: { freshness, africa, confidence, trust, salary, remote, hiring, recency },
  }
}

/**
 * Rank and sort an array of verified jobs. Also filters out any job that
 * doesn't pass the public-feed eligibility check (must be verified, open
 * to Africa, and remote).
 */
export function rankAndFilter(
  jobs: Array<Job & { aiIntelligence?: JobAIIntelligenceRow | null }>,
  companyCounts?: Map<string, number>,
): RankedJob[] {
  return jobs
    .filter((job) => {
      // Public feed eligibility gate — enforced at the display layer
      const ai = job.aiIntelligence
      const mv = ai?.model_version || ''
      const verified = mv.includes(':') && !mv.startsWith('regex')
      const aiRestricted = ai?.africa_eligibility === 'restricted'
      const africaEligible = (job as any).is_open_to_africa !== false && (job as any).eligibility !== 'restricted' && !aiRestricted
      const isRemote = (job as any).is_remote !== false
      return verified && africaEligible && isRemote
    })
    .map((job) => rankJob(job, companyCounts?.get(job.company)))
    .sort((a, b) => b.rankScore - a.rankScore)
}
