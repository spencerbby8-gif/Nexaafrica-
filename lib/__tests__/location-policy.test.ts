import { describe, expect, it } from 'vitest'
import { evaluateLocationPolicy, hasStrongGlobalOutreach } from '@/lib/locationPolicy'
import { classifyEligibility } from '@/lib/ingest/normalize'
import { admit } from '@/lib/ai/admission'

/**
 * [PHASE-2] Generic location integrity: a posting bound to ANY specific
 * place (not just Western regions) is not Africa-open unless the description
 * carries strong global outreach. Regression guard for the Guangzhou defect:
 * a China-bound role with a feed-supplied is_remote=true must not pass.
 */

const adm = (over: Partial<Parameters<typeof admit>[0]> = {}) =>
  admit({
    eligibility: 'likely',
    is_open_to_africa: true,
    is_remote: true,
    apply_url: 'https://example.com/apply/12345',
    country: 'Worldwide',
    location: null,
    description_md: 'Great role on a distributed team.',
    company: 'Acme',
    source: 'greenhouse',
    source_id: 'x',
    expires_at: null,
    ...over,
  } as Parameters<typeof admit>[0])

describe('shared location policy', () => {
  it('rejects the Guangzhou-class defect generically (no hardcoded country list)', () => {
    // location names a specific non-Western place; description has no outreach
    const v = evaluateLocationPolicy('China', 'Worldwide', 'On-site rotation in Guangzhou. Hybrid schedule.')
    expect(v).toEqual({ bound: true, kind: 'specific_location' })
  })

  it('keeps worldwide/remote-anywhere control jobs eligible', () => {
    expect(evaluateLocationPolicy('Worldwide', 'Worldwide', 'Work from anywhere.')).toEqual({ bound: false })
    expect(evaluateLocationPolicy('Remote', null, 'Fully remote team.')).toEqual({ bound: false })
    expect(evaluateLocationPolicy(null, 'Worldwide', 'Hiring across any timezone.')).toEqual({ bound: false })
  })

  it('keeps Africa-located jobs eligible (our market)', () => {
    expect(evaluateLocationPolicy('Lagos, Nigeria', null, 'Join our team.')).toEqual({ bound: false })
    expect(evaluateLocationPolicy('Nairobi', 'Kenya', 'On the ground role.')).toEqual({ bound: false })
    expect(evaluateLocationPolicy(null, 'Africa', 'Continental role.')).toEqual({ bound: false })
  })

  it('description outreach unlocks a specific location', () => {
    expect(evaluateLocationPolicy('Berlin', 'Germany', 'We hire worldwide and support remote from anywhere.')).toEqual({ bound: false })
    expect(evaluateLocationPolicy('Singapore', null, 'Open to candidates across EMEA and Africa.')).toEqual({ bound: false })
  })

  it('outreach qualified back to a restricted region does NOT unlock', () => {
    expect(evaluateLocationPolicy('Guangzhou', null, 'Work anywhere in the US only.').bound).toBe(true)
    // 'Remote within the UK' is caught by the description RESTRICTION gate
    // in admit() (location part 'Remote' is a global token by itself).
    const d = adm({ location: 'Remote', description_md: 'Remote within the UK.' })
    expect(d.admitted).toBe(false)
  })

  it('the "Anywhere Company" false token never unlocks outreach', () => {
    // US-restricted location + description whose only "anywhere" is the firm name.
    const v = evaluateLocationPolicy('US', null, 'Join Anywhere Company — remote anywhere.')
    expect(v).toEqual({ bound: true, kind: 'restricted_region' })
  })

  it('legacy Western restriction lock still fires with its own kind', () => {
    expect(evaluateLocationPolicy('United States', 'United States', 'Great role.')).toEqual({ bound: true, kind: 'restricted_region' })
  })

  it('strong outreach detection matches the previous in-place semantics', () => {
    expect(hasStrongGlobalOutreach('We hire worldwide.')).toBe(true)
    expect(hasStrongGlobalOutreach('Global team with hubs.')).toBe(false) // bare "global" is weak
    expect(hasStrongGlobalOutreach('remote — international')).toBe(true)
  })
})

describe('ingest classifier + admission gate consume the shared policy', () => {
  it('classifier returns restricted for a specific-location posting without outreach', () => {
    expect(classifyEligibility('Guangzhou', 'On-site rotation in Guangzhou. Hybrid schedule.')).toBe('restricted')
  })

  it('classifier keeps worldwide postings likely', () => {
    expect(classifyEligibility('Worldwide', 'Fully remote, work from anywhere worldwide.')).toBe('likely')
  })

  it('admission rejects the Guangzhou class pre-AI even when the feed says remote', () => {
    const d = adm({ location: 'China', country: 'Worldwide', description_md: 'On-site rotation in Guangzhou. Hybrid schedule.' })
    expect(d.admitted).toBe(false)
    if (!d.admitted) {
      expect(d.gate).toBe('work_authorization')
      expect(d.reason).toContain('Location-bound')
    }
  })

  it('admission still admits genuine worldwide roles', () => {
    const d = adm({ location: 'Remote', country: 'Worldwide', description_md: 'Fully remote — hire anywhere worldwide.' })
    expect(d.admitted).toBe(true)
  })

  it('unknown is never promoted: a bound job is excluded, not relabeled eligible', () => {
    const d = adm({ location: 'Buenos Aires', description_md: 'Office role, no remote.' })
    expect(d.admitted).toBe(false)
  })
})
