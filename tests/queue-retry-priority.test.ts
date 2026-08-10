/**
 * Tests: queue drain order — true retries first, fresh second, repair last.
 *
 * Re-audit (2026-08-10): the previous implementation ordered the drain by a
 * raw SQL expression via supabase-js .order(), which double-quotes its column
 * argument — the query would ERROR at runtime (cron runs only in production,
 * so preview could not catch it). The corrected design issues THREE bounded
 * queries (all using plain, valid column ordering):
 *   1. TRUE overdue retries (not repair-requeued) — stranded jobs first
 *   2. FRESH rows (next_retry_at IS NULL) — normal ingestion keeps priority
 *   3. REPAIR-requeued rows, capped — after fresh so they never starve it
 * The drainBatchLimits contract below is what makes that provable.
 */

import { describe, it, expect } from 'vitest'
import { drainBatchLimits, isRepairRequeueError, JAI_REPAIR_ERROR } from '@/lib/ai/jaiRepair'

describe('drainBatchLimits', () => {
  it('true retries and fresh rows get the full batch; repair rows are capped', () => {
    const l = drainBatchLimits(150)
    expect(l.retryLimit).toBe(150)
    expect(l.freshLimit).toBe(150)
    expect(l.repairLimit).toBeLessThanOrEqual(l.freshLimit)
    expect(l.repairLimit).toBeGreaterThanOrEqual(5)
  })

  it('repair cap never exceeds 25% of the batch (starvation guard)', () => {
    for (const b of [10, 20, 50, 100, 150, 300, 1000]) {
      const l = drainBatchLimits(b)
      expect(l.repairLimit).toBeLessThanOrEqual(Math.max(5, Math.floor(b * 0.25)))
    }
  })
})

describe('repair-row identification (drain query 3)', () => {
  it('repair-requeued rows are identified by their error prefix', () => {
    expect(isRepairRequeueError(JAI_REPAIR_ERROR)).toBe(true)
    expect(isRepairRequeueError('Requeued: JAI artifact repair (regex/0-byte/no-ai sealed row)')).toBe(true)
  })

  it('true retries (stranded) are NOT repair rows', () => {
    expect(isRepairRequeueError('AI providers failed (verifyJobReal-threw). Retry #2 scheduled.')).toBe(false)
    expect(isRepairRequeueError(null)).toBe(false)
  })
})
