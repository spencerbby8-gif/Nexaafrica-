import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reconciledCompany } from '@/components/opportunity-intelligence'

/**
 * [PHASE-4B] Product-truth guards:
 *  - UI reconciliation presents measured learning-layer evidence when the
 *    page-fetch verifier honestly abstains — never fabricates AI certainty.
 *  - Engine never finalizes regex-only outcomes as completed intelligence.
 *  - Repair sweep re-queues junk-marker rows for public-eligible jobs.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const row = (over: Record<string, any> = {}): any => ({
  model_version: 'cohere:command-a-03-2025',
  quality_score: 50,
  company_legitimacy: null,
  ...over,
})

describe('company legitimacy reconciliation (UI truth)', () => {
  it('keeps real AI verdicts untouched', () => {
    expect(reconciledCompany(row({ company_legitimacy: 'verified' }), { total_jobs: 500, trust_avg: 95, scam_reports: 0, verification_rate: 0.9 }, false).label).toBe('Company verified')
    expect(reconciledCompany(row({ company_legitimacy: 'suspicious' }), { total_jobs: 500, trust_avg: 95, scam_reports: 0, verification_rate: 0.9 }, false).label).toBe('Needs verification')
  })

  it('presents strong measured track record when AI abstained', () => {
    const r = reconciledCompany(row({ company_legitimacy: 'unknown', company_confidence: 0 }), { total_jobs: 196, trust_avg: 93, scam_reports: 0, verification_rate: 0.06 }, false)
    expect(r.label).toBe('Unverified by AI — strong employer record')
    expect(r.detail).toContain('196 postings')
    expect(r.detail).toContain('trust 93/100')
    expect(r.detail).toContain('0 scam reports')
  })

  it('does NOT upgrade on weak or scam-tainted records', () => {
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 5, trust_avg: 99, scam_reports: 0, verification_rate: 0 }, false).label).toBe('Company legitimacy unknown')
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 500, trust_avg: 99, scam_reports: 2, verification_rate: 0.9 }, false).label).toBe('Company legitimacy unknown')
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), null, false).label).toBe('Company legitimacy unknown')
  })

  it('never claims AI verification it does not have', () => {
    const r = reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 196, trust_avg: 93, scam_reports: 0, verification_rate: 0.5 }, false)
    expect(r.label.startsWith('Company verified')).toBe(false)
    expect(r.label).toContain('Unverified by AI')
  })
})

describe('engine coverage repairs', () => {
  it('regex-only outcomes are treated as provider failures (retried, never finalized)', () => {
    const engine = read('lib/ai/engine.ts')
    const m = engine.match(/const allProvidersFailed = [^\n]+/)
    expect(m).toBeTruthy()
    expect(m![0]).toContain('regex-extracted')
    expect(m![0]).toContain('verifyJobReal-threw')
    expect(m![0]).toContain('no-ai-providers')
  })

  it('repair sweep re-queues junk-marker rows for eligible jobs', () => {
    const engine = read('lib/ai/engine.ts')
    expect(engine).toContain('model_version.like.regex-extracted%')
    expect(engine).toContain('model_version.eq.verifyJobReal-threw')
    // still restricted to public-eligible jobs (no reject-loop regression)
    expect(engine).toContain('.in("jobs.eligibility", ["explicit", "likely"])')
  })
})
