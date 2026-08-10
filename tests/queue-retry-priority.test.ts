/**
 * Tests: overdue-retry priority in the AI queue drain.
 *
 * Root cause (verified in production): processAIQueue drains with
 * .order('priority', desc) and a 240s budget. A low-priority (10) retry whose
 * next_retry_at is already DUE can be starved forever while fresh
 * high-priority rows keep arriving each daily run — the job never gets its
 * JAI row. Observed: one pending row sat due (next_retry 05:56) past 20:01.
 *
 * The fix introduces a pure, exported helper
 *   overdueFirstOrderBy(nowIso) -> { field, options }
 * that the drain uses as its PRIMARY order by: overdue retries
 * (next_retry_at IS NOT NULL AND <= now) first, then priority desc, then
 * created_at asc. Fresh rows (next_retry_at IS NULL) keep their priority
 * semantics.
 */

import { describe, it, expect } from 'vitest'
import { overdueFirstOrderBy } from '@/lib/ai/engine'

describe('overdueFirstOrderBy', () => {
  it('puts overdue retries first, then priority desc, then created_at asc', () => {
    const now = new Date('2026-08-10T20:00:00Z').toISOString()
    const { orderBy } = overdueFirstOrderBy(now)
    expect(orderBy).toHaveLength(3)
    // primary: overdue-first expression
    expect(orderBy[0].field).toContain('next_retry_at')
    expect(orderBy[0].options).toMatchObject({ ascending: false })
    // then priority desc
    expect(orderBy[1]).toMatchObject({ field: 'priority', options: { ascending: false } })
    // then created_at asc
    expect(orderBy[2]).toMatchObject({ field: 'created_at', options: { ascending: true } })
  })

  it('the overdue-first expression separates overdue rows from fresh rows', () => {
    const now = new Date('2026-08-10T20:00:00Z').toISOString()
    const { overdueExpr } = overdueFirstOrderBy(now)
    expect(overdueExpr).toBe('next_retry_at IS NOT NULL AND next_retry_at <= ' + now)
  })
})
