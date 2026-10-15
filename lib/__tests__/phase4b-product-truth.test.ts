import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reconciledCompany } from '@/components/opportunity-intelligence'

/**
 * [PHASE-4B] Product-truth guards:
 *  - UI reconciliation never upgrades unknown identity from recycled learning-layer
 *    scores — a separate documented investigation is required.
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

  it('keeps unsupported company identity unknown regardless of model-history volume',()=>{
    const a=reconciledCompany(row({company_legitimacy:'verified'}),strong,false)
    const b=reconciledCompany(row({company_legitimacy:'unknown'}),strong,false)
    expect(a.label).toBe('Company legitimacy unknown')
    expect(b.label).toBe('Company legitimacy unknown')
    expect(a.detail).not.toContain('500 postings')
  })
  it('describes source-backed extraction without an employer endorsement',()=>{
    const r=reconciledCompany(row({company_legitimacy:'verified',company_evidence:'Company self-description'}),strong,false)
    expect(r.label).toBe('Company claims recorded')
    expect(r.detail).toContain('does not independently verify')
  })
  it('requires evidence even when no legacy employer record exists',()=>{
    expect(reconciledCompany(row({company_legitimacy:'verified'}),null,false).label).toBe('Company legitimacy unknown')
    expect(reconciledCompany(row({company_legitimacy:'suspicious',company_evidence:'A concerning claim requiring review.'}),null,false).label).toBe('Company concern flagged by model')
    expect(reconciledCompany(row({company_legitimacy:'unknown'}),null,false).label).toBe('Company legitimacy unknown')
  })

  it('does NOT upgrade on weak or scam-tainted records', () => {
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 5, trust_avg: 99, scam_reports: 0, verification_rate: 0 }, false).label).toBe('Company legitimacy unknown')
    expect(reconciledCompany(row({ company_legitimacy: 'unknown' }), { total_jobs: 500, trust_avg: 99, scam_reports: 2, verification_rate: 0.9 }, false).label).toBe('Company legitimacy unknown')
  })

  it('employer reputation never claims the specific listing is AI-verified', () => {
    const r = reconciledCompany(row({ company_legitimacy: 'unknown' }), strong, false)
    expect(r.label).not.toBe('Company verified')
    expect(r.detail).toContain('separate documented investigation')
  })
})

describe('engine coverage repairs', () => {
  it('regex-only outcomes are treated as provider failures (retried, never finalized)', () => {
    const engine = read('lib/ai/engine.ts')
    expect(engine).toContain('!isProviderResult(intelligence.modelVersion)')
    expect(engine).toContain('prior intelligence retained')
    const policy=read('lib/ai/queue-policy.ts')
    expect(policy).toContain('regex|no-ai|failed|verifyJobReal')
  })

  it('repair sweep re-queues junk-marker rows for eligible jobs', () => {
    const engine = read('lib/ai/engine.ts')
    expect(engine).toContain("rpc('requeue_stale_ai'")
    const sql=read('supabase/migrations/20261014000200_ai_attempt_integrity.sql')
    expect(sql).toContain("a.model_version LIKE 'regex%'")
    expect(sql).toContain("a.model_version='verifyJobReal-threw'")
    expect(sql).toContain("j.eligibility IN('explicit','likely')")
  })
})
