import { describe, expect, it } from 'vitest'
import {
  VERIFIED_MIN_QUALITY,
  isVerifiedIntelligence,
  isVerifiedAfricaOpen,
  partitionVerifiedFirst,
} from '@/lib/ai/verified'

/** [PHASE-2] The canonical "verified" contract — one rule everywhere. */

const row = (model_version: string | null, quality_score: number | null, africa: string | null = 'likely') => ({
  model_version,
  quality_score,
  africa_eligibility: africa,
})

describe('canonical verified contract', () => {
  it('requires a real provider:model provenance', () => {
    expect(isVerifiedIntelligence(row('cohere:command-a-03-2025', 90))).toBe(true)
    expect(isVerifiedIntelligence(row('regex-extracted-4117bytes', 90))).toBe(false)
    expect(isVerifiedIntelligence(row('no-ai-providers', 90))).toBe(false)
    expect(isVerifiedIntelligence(row(null, 90))).toBe(false)
    expect(isVerifiedIntelligence(row('failed-no-evidence', 90))).toBe(false)
    expect(isVerifiedIntelligence(null)).toBe(false)
    expect(isVerifiedIntelligence(undefined)).toBe(false)
  })

  it('requires quality_score >= the learning-layer bar (40)', () => {
    expect(VERIFIED_MIN_QUALITY).toBe(40)
    expect(isVerifiedIntelligence(row('mistral:mistral-medium-2508', 40))).toBe(true)
    expect(isVerifiedIntelligence(row('mistral:mistral-medium-2508', 39))).toBe(false)
    expect(isVerifiedIntelligence(row('mistral:mistral-medium-2508', null))).toBe(false)
  })

  it('never promotes unknown to Africa-open', () => {
    expect(isVerifiedAfricaOpen(row('cohere:command-a-03-2025', 90, 'unknown'))).toBe(false)
    expect(isVerifiedAfricaOpen(row('cohere:command-a-03-2025', 90, 'restricted'))).toBe(false)
    expect(isVerifiedAfricaOpen(row('cohere:command-a-03-2025', 90, 'explicit'))).toBe(true)
    expect(isVerifiedAfricaOpen(row('cohere:command-a-03-2025', 90, 'likely'))).toBe(true)
    expect(isVerifiedAfricaOpen(row('cohere:command-a-03-2025', 10, 'likely'))).toBe(false)
  })
})

describe('verified-first partition (pagination building block)', () => {
  const jobs = [
    { id: 'a', posted_at: '2026-08-19', aiIntelligence: row('regex-x', 90) },
    { id: 'b', posted_at: '2026-08-18', aiIntelligence: row('groq:llama-3.3-70b-versatile', 61) },
    { id: 'c', posted_at: '2026-08-17', aiIntelligence: null },
    { id: 'd', posted_at: '2026-08-16', aiIntelligence: row('cohere:command-a-03-2025', 35) },
    { id: 'e', posted_at: '2026-08-15', aiIntelligence: row('mistral:mistral-medium-2508', 40) },
  ]

  it('puts canonical-verified jobs first, preserving DB order inside tiers', () => {
    expect(partitionVerifiedFirst(jobs).map((j) => j.id)).toEqual(['b', 'e', 'a', 'c', 'd'])
  })

  it('is deterministic and lossless across simulated pagination', () => {
    // Simulate the /api/jobs contract: cursor walks the base ordering;
    // each page partitions its window verified-first. No duplicates, no gaps.
    const base = [...jobs] // DB order
    const seen: string[] = []
    const pageSize = 2
    for (let i = 0; i < base.length; i += pageSize) {
      const window = base.slice(i, i + pageSize)
      seen.push(...partitionVerifiedFirst(window).map((j) => j.id))
    }
    expect(seen.sort()).toEqual(jobs.map((j) => j.id).sort())
    expect(new Set(seen).size).toBe(jobs.length)
  })
})
