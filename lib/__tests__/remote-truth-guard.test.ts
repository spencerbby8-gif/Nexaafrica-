import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REMOTE_WRITEBACK_MIN_CONFIDENCE } from '@/lib/ai/verified'

/**
 * [PHASE-3 FIX] The ingest upsert writes the feed's is_remote onto existing
 * rows, which silently reverts the engine's evidenced hybrid/onsite
 * write-backs (proven live: 329 -> 158 flips after one Tier-1 cycle).
 * These structural guards keep the re-application wired in.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('remote truth re-application guard', () => {
  it('threshold is shared and sane', () => {
    expect(REMOTE_WRITEBACK_MIN_CONFIDENCE).toBeGreaterThanOrEqual(50)
    expect(REMOTE_WRITEBACK_MIN_CONFIDENCE).toBeLessThanOrEqual(100)
  })

  it('admission exports the reapply function', () => {
    expect(read('lib/ai/admission.ts')).toContain('export async function reapplyRemoteTruthWrites')
  })

  it('ingest re-applies remote truth after every source batch', () => {
    expect(read('lib/ingest/run.ts')).toContain('reapplyRemoteTruthWrites')
  })

  it('the AI drain chain head re-applies remote truth too', () => {
    expect(read('app/api/ai/process/route.ts')).toContain('reapplyRemoteTruthWrites')
  })

  it('engine write-back uses the shared threshold (no local drift)', () => {
    const engine = read('lib/ai/engine.ts')
    expect(engine).toContain('REMOTE_WRITEBACK_MIN_CONFIDENCE')
    expect(engine).not.toContain('const REMOTE_WRITEBACK_MIN_CONFIDENCE')
  })
})
