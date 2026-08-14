import { describe, it, expect } from 'vitest'
import { shouldVerify } from '../secondOpinion'

/**
 * [2026-08-13 audit] Second-opinion trigger boundaries — the cost/benefit of
 * second opinions depends on the trigger being correct: it must fire exactly
 * on weak first-pass output (low quality / low evidence / high hallucination
 * risk / missing fields) and NOT on healthy output.
 */
function row(over: Record<string, unknown> = {}) {
  return {
    africa_eligibility: 'likely', africa_evidence: 'A quote from the posting that is long enough', africa_confidence: 70,
    remote_eligibility: 'fully_remote', remote_evidence: 'A quote from the posting that is long enough', remote_confidence: 70,
    salary_transparency: 'disclosed', salary_evidence: 'A quote from the posting that is long enough', salary_confidence: 70,
    company_legitimacy: 'likely_legit', company_evidence: 'A quote from the company page that is long enough', company_confidence: 70,
    experience_level: 'senior', experience_confidence: 70,
    job_quality: 'high', job_quality_evidence: 'A quote from the posting that is long enough', job_quality_confidence: 70,
    required_skills: ['a', 'b', 'c', 'd', 'e'],
    ...over,
  }
}

describe('shouldVerify — second-opinion trigger boundaries', () => {
  it('healthy first pass → NO second opinion', () => {
    const check = shouldVerify(row())
    expect(check.needed).toBe(false)
    expect(check.reason).toContain('quality ok')
  })

  it('low quality → second opinion with reason', () => {
    const check = shouldVerify(row({
      africa_eligibility: 'unknown', africa_evidence: null, africa_confidence: 0,
      remote_eligibility: 'unknown', remote_evidence: null, remote_confidence: 0,
      company_legitimacy: 'unknown', company_evidence: null, company_confidence: 0,
      salary_transparency: 'unknown', salary_evidence: null, salary_confidence: 0,
    }))
    expect(check.needed).toBe(true)
    expect(check.reason).toMatch(/low quality|low evidence|missing fields/)
  })

  it('many missing fields → second opinion', () => {
    const check = shouldVerify(row({
      africa_eligibility: 'unknown', remote_eligibility: 'unknown',
      company_legitimacy: 'unknown', experience_level: 'unknown',
    }))
    expect(check.needed).toBe(true)
  })

  it('high hallucination risk (high confidence, no evidence) → second opinion', () => {
    const check = shouldVerify(row({
      africa_evidence: null, remote_evidence: null, salary_evidence: null,
      company_evidence: null, job_quality_evidence: null,
      africa_confidence: 90, remote_confidence: 90, salary_confidence: 90,
      company_confidence: 90, job_quality_confidence: 90,
    }))
    // Trigger fires on the weak output; the earliest check (low evidence)
    // reports first by design — the invariant is that weak output triggers.
    expect(check.needed).toBe(true)
    expect(check.reason).toMatch(/low (evidence|quality)|hallucination/)
  })
})
