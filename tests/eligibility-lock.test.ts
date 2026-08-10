/**
 * Focused tests: eligibility/admission precedence lock.
 *
 * Root cause (verified in production): the ingest upsert unconditionally
 * re-wrote eligibility / is_open_to_africa / is_active from the fresh crawl,
 * silently undoing the admission gate's rejection write-back. 77 active jobs
 * in production: queue says "Rejected: ... [africa_eligibility]" but the jobs
 * row says eligibility=likely/explicit + is_open_to_africa=true.
 *
 * Canonical-owner rule:
 *   - admission-rejected (africa_eligibility / work_authorization)
 *       -> eligibility='restricted', is_open_to_africa=false (re-applied every
 *          ingest, self-healing rows clobbered before the lock existed)
 *   - admission-rejected (onsite_only / expired / dead_url / placeholder_company)
 *       -> is_active=false
 *   - never rejected -> incoming ingest classification flows through unchanged
 */

import { describe, it, expect } from 'vitest'
import { resolveEligibilityLock, parseAdmissionGate } from '@/lib/ingest/eligibilityLock'

describe('resolveEligibilityLock — Africa/work-authorization gates', () => {
  it('re-applies restricted + not-open-to-Africa on re-ingest of a rejected job', () => {
    const out = resolveEligibilityLock({
      incomingEligibility: 'likely',
      incomingOpenToAfrica: true,
      admissionGate: 'africa_eligibility',
    })
    expect(out).toMatchObject({ eligibility: 'restricted', is_open_to_africa: false, locked: true })
    expect(out.reason).toContain('africa_eligibility')
  })

  it('handles work_authorization gate the same way', () => {
    const out = resolveEligibilityLock({
      incomingEligibility: 'explicit',
      incomingOpenToAfrica: true,
      admissionGate: 'work_authorization',
    })
    expect(out.eligibility).toBe('restricted')
    expect(out.is_open_to_africa).toBe(false)
    expect(out.locked).toBe(true)
  })

  it('self-heals a clobbered row: incoming likely cannot undo the rejection', () => {
    // The 77-row production case: DB row was already overwritten to likely by
    // an old re-ingest; the lock must STILL apply the admission verdict.
    const out = resolveEligibilityLock({
      incomingEligibility: 'likely',
      incomingOpenToAfrica: true,
      admissionGate: 'africa_eligibility',
    })
    expect(out.eligibility).toBe('restricted')
    expect(out.is_open_to_africa).toBe(false)
  })
})

describe('resolveEligibilityLock — deactivation gates', () => {
  it('deactivates on onsite_only rejection but keeps the classification', () => {
    const out = resolveEligibilityLock({
      incomingEligibility: 'likely',
      incomingOpenToAfrica: true,
      admissionGate: 'onsite_only',
    })
    expect(out.is_active).toBe(false)
    expect(out.eligibility).toBe('likely')
    expect(out.locked).toBe(true)
  })

  it('deactivates on expired / dead_url / placeholder_company', () => {
    for (const gate of ['expired', 'dead_url', 'placeholder_company']) {
      const out = resolveEligibilityLock({ incomingEligibility: 'likely', incomingOpenToAfrica: true, admissionGate: gate })
      expect(out.is_active).toBe(false)
      expect(out.locked).toBe(true)
    }
  })
})

describe('resolveEligibilityLock — legitimate ingest classification preserved', () => {
  it('fresh job (never rejected) flows through unchanged and active', () => {
    const out = resolveEligibilityLock({
      incomingEligibility: 'likely',
      incomingOpenToAfrica: true,
      admissionGate: null,
    })
    expect(out).toMatchObject({ eligibility: 'likely', is_open_to_africa: true, is_active: true, locked: false })
  })

  it('re-ingest of a never-rejected job updates classification normally', () => {
    const out = resolveEligibilityLock({
      incomingEligibility: 'explicit',
      incomingOpenToAfrica: true,
      admissionGate: null,
    })
    expect(out.eligibility).toBe('explicit')
    expect(out.locked).toBe(false)
  })

  it('ingest of a restricted job (own classifier) still writes restricted', () => {
    const out = resolveEligibilityLock({
      incomingEligibility: 'restricted',
      incomingOpenToAfrica: false,
      admissionGate: null,
    })
    expect(out).toMatchObject({ eligibility: 'restricted', is_open_to_africa: false, is_active: true })
  })
})

describe('parseAdmissionGate', () => {
  it('extracts the gate from engine-style rejection errors', () => {
    expect(parseAdmissionGate('Rejected: Not open to African applicants [africa_eligibility]')).toBe('africa_eligibility')
    expect(parseAdmissionGate('Rejected: On-site only — not remote [onsite_only]')).toBe('onsite_only')
    expect(parseAdmissionGate('Rejected: Job listing has expired [expired]')).toBe('expired')
  })

  it('returns null for non-rejection or unparseable errors', () => {
    expect(parseAdmissionGate(null)).toBeNull()
    expect(parseAdmissionGate(undefined)).toBeNull()
    expect(parseAdmissionGate('AI providers failed (no-ai-providers). Retry #2 scheduled.')).toBeNull()
    expect(parseAdmissionGate('Rejected: something without a gate')).toBeNull()
  })
})
