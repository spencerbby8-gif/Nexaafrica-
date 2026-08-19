import { describe, expect, it } from 'vitest'
import { planReverification } from '@/lib/ai/engine'

/**
 * [PHASE-4] Stale-first re-verification planner: oldest first, in-flight
 * jobs untouched, hard budget — the mechanism that turns the infinite
 * re-verification horizon into a controlled, bounded cycle.
 */

const rows = (spec: Array<[string, string | null]>) =>
  spec.map(([job_id, last_verified_at]) => ({ job_id, last_verified_at }))

describe('re-verification planner', () => {
  it('selects oldest-first within budget', () => {
    const chosen = planReverification(
      rows([
        ['new', '2026-08-18T00:00:00Z'],
        ['oldest', '2026-08-01T00:00:00Z'],
        ['mid', '2026-08-10T00:00:00Z'],
      ]),
      new Set(),
      2,
    )
    expect(chosen.map((c) => c.job_id)).toEqual(['oldest', 'mid'])
  })

  it('never re-queues jobs already pending/processing', () => {
    const chosen = planReverification(
      rows([
        ['a', '2026-08-01T00:00:00Z'],
        ['b', '2026-08-02T00:00:00Z'],
        ['c', '2026-08-03T00:00:00Z'],
      ]),
      new Set(['a', 'b']),
      5,
    )
    expect(chosen.map((c) => c.job_id)).toEqual(['c'])
  })

  it('honors a zero budget (kill switch)', () => {
    expect(planReverification(rows([['a', '2026-08-01T00:00:00Z']]), new Set(), 0)).toEqual([])
  })

  it('handles missing timestamps deterministically', () => {
    const chosen = planReverification(
      rows([['x', null], ['y', '2026-08-05T00:00:00Z']]),
      new Set(),
      2,
    )
    expect(chosen.map((c) => c.job_id)).toEqual(['x', 'y']) // empty string sorts first
  })
})
