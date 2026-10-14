import { describe, expect, it } from 'vitest'
import { classifyEligibility } from '@/lib/ingest/normalize'
import { evaluateLocationPolicy } from '@/lib/locationPolicy'
import { globalHiringEvidence, africanHiringEvidence } from '@/lib/eligibility-evidence'
import { admit } from '@/lib/ai/admission'

const cases = [
  ['Reddit', 'Remote - United States', 'Worldwide', 'We are a remote-friendly company, and this position is open to candidates anywhere in the U.S.'],
  ['Figma', 'San Francisco, CA • New York, NY • United States', 'United States', 'From idea to product, Figma empowers teams to work together in real time from anywhere in the world. This is a full time role that can be held from one of our US hubs or remotely in the United States.'],
  ['RevPilots', 'Canada, United States', 'United States', 'Remote — USA or Canada. Our products serve customers worldwide.'],
  ['WIT Software', 'United States', 'United States', 'This is a remote position. The company works with Telecom companies from Europe, Japan, United States and Africa.'],
]
describe('real production eligibility failures', () => {
  for (const [company, location, country, description_md] of cases) it(`blocks ${company} without treating business reach as hiring permission`, () => {
    expect(evaluateLocationPolicy(location, country, description_md).bound).toBe(true)
    expect(classifyEligibility(location, 'Engineer', description_md)).toBe('restricted')
    const result = admit({company, location, country, description_md, eligibility:'likely', is_open_to_africa:true, is_remote:true, apply_url:'https://example.com/jobs/role', source:'test', source_id:'x', expires_at:null})
    expect(result.admitted).toBe(false)
  })
  it('does not mistake African customers for African hiring', () => {
    expect(africanHiringEvidence('We serve customers in Nigeria and Africa.')).toBeNull()
    expect(globalHiringEvidence('Our platform lets customers work from anywhere.')).toBeNull()
    expect(classifyEligibility('Remote', 'We serve customers in Nigeria and Africa.')).toBe('unknown')
  })
  it('keeps actual African hiring, including must-be-based-in-Nigeria roles', () => {
    for (const country of ['Nigeria','Kenya']) {
      const description_md=`You must be based in ${country}. This is a remote contractor role; no visa sponsorship required.`
      expect(classifyEligibility(country, description_md)).toBe('explicit')
      expect(admit({company:'Acme',location:country,country,description_md,eligibility:'explicit',is_open_to_africa:true,is_remote:true,apply_url:'https://example.com/jobs/role',source:'test',source_id:'x',expires_at:null}).admitted).toBe(true)
    }
  })
  it('allows explicit worldwide recruiting, not bare marketing language', () => {
    expect(classifyEligibility('Remote','We hire worldwide. Work from anywhere.')).toBe('likely')
    expect(classifyEligibility('Remote','This is a globally remote role.')).toBe('likely')
    expect(classifyEligibility('Remote','Location: Remote (EMEA)')).toBe('likely')
    expect(classifyEligibility('Remote','Our global platform serves customers worldwide.')).toBe('unknown')
    expect(classifyEligibility('Worldwide','Work from anywhere - enjoy remote work within the country of employment. Candidates must reside and have the legal right to work in the locations mentioned.')).toBe('unknown')
  })
})
