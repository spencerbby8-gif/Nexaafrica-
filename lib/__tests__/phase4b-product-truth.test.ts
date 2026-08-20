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
  const strong = { total_jobs: 500, trust_avg: 95, scam_reports: 0, verification_rate: 0.9 }

  it('uses a STABLE employer-level headline when the record is strong (consistency)', () => {
    // Two jobs at the same strong employer get the SAME headline even though
    // their listing-level verdicts differ — this is the consistency fix.
    const a = reconciledCompany(row({ company_legitimacy: 'verified' }), strong, false)
    const b = reconciledCompany(row({ company_legitimacy: 'unknown' }), strong, false)
    expect(a.label).toBe('Established employer')
    expect(b.label).toBe('Established employer')
    expect(a.detail).toContain('500 postings')
    expect(a.detail).toContain('trust 95/100')
  })

  it('surfaces the listing-level verdict as detail, never as an overclaim', () => {
    const withVerdict = reconciledCompany(row({ company_legitimacy: 'verified' }), strong, false)
    expect(withVerdict.detail).toContain('This listing: company verified')
    const abstained = reconciledCompany(row({ company_legitimacy: 'unknown' }), strong, false)
    expect(abstained.detail).toContain('not yet verified by AI')
  })

  it('falls back to the listing-level verdict when there is no strong employer record', () => {
    expect(reconciledCompany(row({ company_legitimacy: 'verified' }), null, false).label).toBe('Company verified')
    expect(reconciledCompany(row({ company_legitimacy: 'suspicious' }), null, false).label).toBe('Needs verification')
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), null, false).label).toBe('Company legitimacy unknown')
  })

  it('does NOT upgrade on weak or scam-tainted records', () => {
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 5, trust_avg: 99, scam_reports: 0, verification_rate: 0 }, false).label).toBe('Company legitimacy unknown')
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 500, trust_avg: 99, scam_reports: 2, verification_rate: 0.9 }, false).label).toBe('Company legitimacy unknown')
  })

  it('employer reputation never claims the specific listing is AI-verified', () => {
    const r = reconciledCompany(row({ company_legitimacy: 'unknown' }), strong, false)
    expect(r.label).not.toBe('Company verified')
    expect(r.detail).toContain('not yet verified by AI')
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
