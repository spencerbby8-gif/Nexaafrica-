/**
 * Tests: JAI artifact repair predicate + false-success safeguard.
 *
 * Root cause (verified in production rows): 348 of 354 regex-extracted-0bytes
 * rows sit on queue rows that are 'completed' with NULL error — they were
 * SEALED by the pre-fix pipeline when all AI providers were down (gemini dead,
 * openrouter 402, github 401, mistral/groq rate-limited) and the code stamped
 * the run done with zero evidence. The orphan-heal only re-queues rows with NO
 * JAI, so these are permanent without the repair.
 *
 * Repair contract:
 *   - ONLY completed+clean rows whose JAI is an artifact (regex-extracted-* /
 *     no-ai-providers / failed-* / verifyJobReal-threw) are re-queued
 *   - ONLY active/visible jobs (is_active, not restricted, open-to-Africa)
 *   - bounded per drain, idempotent, re-runs through normal retry/backoff
 *   - never re-queues rows that already have real AI intelligence
 */

import { describe, it, expect } from 'vitest'
import { isRepairableArtifactJai, isRepairableJob } from '@/lib/ai/jaiRepair'

describe('isRepairableArtifactJai', () => {
  it('flags regex-extracted-* artifacts', () => {
    expect(isRepairableArtifactJai('regex-extracted-0bytes')).toBe(true)
    expect(isRepairableArtifactJai('regex-extracted-4117bytes')).toBe(true)
  })

  it('flags no-ai-providers / failed-* / verifyJobReal-threw', () => {
    expect(isRepairableArtifactJai('no-ai-providers')).toBe(true)
    expect(isRepairableArtifactJai('failed-no-evidence')).toBe(true)
    expect(isRepairableArtifactJai('verifyJobReal-threw')).toBe(true)
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
