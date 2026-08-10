/**
 * Tests: JAI artifact repair — re-audited contracts (2026-08-10).
 *
 * Re-audit findings (real rows):
 *   - The true repairable set (zero-evidence artifacts, active/visible jobs)
 *     is 162 rows — ALL regex-extracted-0bytes.
 *   - regex-extracted-Nbytes (N>0) rows have real page text and MUST NOT be
 *     re-queued: the current pipeline legitimately re-seals them as the same
 *     class (page text exists) -> infinite requeue. They are not artifacts.
 *   - A failed re-run over an artifact existing JAI must RETRY (backoff ->
 *     failed after max_attempts), never upsert the failed result + complete.
 *   - Repair rows are drained AFTER fresh rows (capped) so they can never
 *     starve normal ingestion or true overdue retries.
 */

import { describe, it, expect } from 'vitest'
import {
  isRepairableArtifactJai,
  isRepairableJob,
  isFailedVerification,
  shouldRetryFailedRun,
  drainBatchLimits,
  isRepairRequeueError,
  JAI_REPAIR_ERROR,
} from '@/lib/ai/jaiRepair'

describe('isRepairableArtifactJai (zero-evidence only)', () => {
  it('flags only zero-evidence artifacts', () => {
    expect(isRepairableArtifactJai('regex-extracted-0bytes')).toBe(true)
    expect(isRepairableArtifactJai('no-ai-providers')).toBe(true)
    expect(isRepairableArtifactJai('failed-no-evidence')).toBe(true)
    expect(isRepairableArtifactJai('verifyJobReal-threw')).toBe(true)
  })

  it('does NOT flag regex-extracted-Nbytes (real page text — would re-seal + loop)', () => {
    expect(isRepairableArtifactJai('regex-extracted-4117bytes')).toBe(false)
    expect(isRepairableArtifactJai('regex-extracted-31bytes')).toBe(false)
  })

  it('does NOT flag real AI intelligence or deterministic owners', () => {
    expect(isRepairableArtifactJai('mistral:mistral-medium-2508')).toBe(false)
    expect(isRepairableArtifactJai('cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast')).toBe(false)
    expect(isRepairableArtifactJai('rule-based-v1 + web-research')).toBe(false)
    expect(isRepairableArtifactJai('rule-based-v1')).toBe(false)
    expect(isRepairableArtifactJai(null)).toBe(false)
    expect(isRepairableArtifactJai(undefined)).toBe(false)
  })
})

describe('isRepairableJob', () => {
  it('only active, visible (not restricted, open-to-Africa) jobs are repairable', () => {
    expect(isRepairableJob({ is_active: true, eligibility: 'likely', is_open_to_africa: true })).toBe(true)
    expect(isRepairableJob({ is_active: true, eligibility: 'explicit', is_open_to_africa: true })).toBe(true)
    expect(isRepairableJob({ is_active: false, eligibility: 'likely', is_open_to_africa: true })).toBe(false)
    expect(isRepairableJob({ is_active: true, eligibility: 'restricted', is_open_to_africa: true })).toBe(false)
    expect(isRepairableJob({ is_active: true, eligibility: 'likely', is_open_to_africa: false })).toBe(false)
  })
})

describe('isFailedVerification', () => {
  it('detects the failed-run model versions', () => {
    expect(isFailedVerification('no-ai-providers')).toBe(true)
    expect(isFailedVerification('failed-no-evidence')).toBe(true)
    expect(isFailedVerification('verifyJobReal-threw')).toBe(true)
    expect(isFailedVerification('mistral:mistral-medium-2508')).toBe(false)
    expect(isFailedVerification('regex-extracted-4117bytes')).toBe(false)
    expect(isFailedVerification(null)).toBe(false)
  })
})

describe('shouldRetryFailedRun (loop prevention)', () => {
  it('retries when there is no existing JAI', () => {
    expect(shouldRetryFailedRun(null, true, false)).toBe(true)
  })

  it('retries when the existing JAI is an artifact (never seal failed over artifact)', () => {
    expect(shouldRetryFailedRun({ modelVersion: 'regex-extracted-0bytes', isReal: false }, true, false)).toBe(true)
    expect(shouldRetryFailedRun({ modelVersion: 'no-ai-providers', isReal: false }, true, false)).toBe(true)
  })

  it('does NOT retry when a real existing JAI is protected (skipUpsert) or no failure', () => {
    expect(shouldRetryFailedRun({ modelVersion: 'mistral:mistral-medium-2508', isReal: true }, true, true)).toBe(false)
    expect(shouldRetryFailedRun({ modelVersion: 'mistral:mistral-medium-2508', isReal: true }, false, false)).toBe(false)
    expect(shouldRetryFailedRun(null, false, false)).toBe(false)
  })
})

describe('drainBatchLimits (non-starvation)', () => {
  it('caps repair rows to <=25% of batch, clamped [5,50]', () => {
    expect(drainBatchLimits(150).repairLimit).toBe(37)
    expect(drainBatchLimits(100).repairLimit).toBe(25)
    expect(drainBatchLimits(10).repairLimit).toBe(5)
    expect(drainBatchLimits(1000).repairLimit).toBe(50)
  })

  it('fresh and retry limits equal the batch size', () => {
    const l = drainBatchLimits(150)
    expect(l.retryLimit).toBe(150)
    expect(l.freshLimit).toBe(150)
  })
})

describe('isRepairRequeueError + JAI_REPAIR_ERROR', () => {
  it('matches the exact repair error and no other error', () => {
    expect(isRepairRequeueError(JAI_REPAIR_ERROR)).toBe(true)
    expect(isRepairRequeueError('Requeued: JAI artifact repair (regex/0-byte/no-ai sealed row)')).toBe(true)
    expect(isRepairRequeueError('AI providers failed (no-ai-providers). Retry #2 scheduled.')).toBe(false)
    expect(isRepairRequeueError(null)).toBe(false)
  })
})
