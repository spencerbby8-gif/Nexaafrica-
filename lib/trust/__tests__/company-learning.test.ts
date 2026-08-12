import { describe, it, expect } from 'vitest'
import { companyLearningSignal } from '../signals/companyLearning'
import type { Job } from '@/lib/types'

/**
 * [V1-HONESTY] Trust-signal guard tests:
 * the "Rarely open to Africa" caution must ONLY fire when the AI has actually
 * judged enough jobs (>=8) and found them mostly not open. Sparse evidence
 * (the norm today: Stripe 30/659 judged, OpenAI 4/442) must yield the neutral
 * "Limited verification" note, never a false caution that tanks trust.
 */

const job = { company: 'Acme', id: 'x', slug: 'x', title: 'Engineer' } as unknown as Job

function ci(over: Record<string, unknown>) {
  return {
    total_jobs: 100,
    rejection_rate: 0.1,
    verification_rate: 0.5,
    hiring_velocity_30d: 10,
    avg_ai_confidence: 30,
    africa_decided_jobs: 0,
    africa_open_of_decided: 0,
    africa_unknown_share: 0.95,
    ...over,
  }
}

describe('companyLearningSignal — honesty guards (2026-08-12 audit)', () => {
  it('sparse evidence (decided < 8) → neutral "Limited verification", NEVER the caution', () => {
    const s = companyLearningSignal(job, { companyIntel: ci({ africa_decided_jobs: 2, africa_open_of_decided: 0, africa_unknown_share: 0.97 }) })
    expect(s).not.toBeNull()
    expect(s!.tone).toBe('neutral')
    expect(s!.label).toBe('Limited verification')
    expect(s!.scoreImpact).toBe(0)
  })

  it('enough judged + mostly not open (decided>=8, open<20%) → caution fires (measured truth)', () => {
    const s = companyLearningSignal(job, { companyIntel: ci({ africa_decided_jobs: 10, africa_open_of_decided: 0.1, africa_unknown_share: 0.3 }) })
    expect(s!.label).toBe('Rarely open to Africa')
    expect(s!.tone).toBe('caution')
    expect(s!.scoreImpact).toBe(-6)
  })

  it('enough judged + mostly open (open>=20%) → NO caution', () => {
    const s = companyLearningSignal(job, { companyIntel: ci({ africa_decided_jobs: 10, africa_open_of_decided: 0.6, africa_unknown_share: 0.3 }) })
    expect(s?.label).not.toBe('Rarely open to Africa')
  })

  it('high rejection history still warns (unchanged behavior)', () => {
    const s = companyLearningSignal(job, { companyIntel: ci({ rejection_rate: 0.7 }) })
    expect(s!.label).toBe('High rejection history')
    expect(s!.tone).toBe('warning')
  })

  it('no companyIntel → no signal (unchanged)', () => {
    expect(companyLearningSignal(job, {})).toBeNull()
  })
})
