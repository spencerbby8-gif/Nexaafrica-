import { describe, expect, it } from 'vitest'
import { computeContentHash } from '@/lib/ingest/normalize'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('Phase 4D — content change detection (computeContentHash)', () => {
  const base = {
    title: 'Senior Engineer',
    description_md: 'Build things. Remote friendly.',
    location: 'Worldwide',
    country: 'Worldwide',
    salary_range: '$100k-$150k',
    is_remote: true,
  }

  it('is deterministic for identical content', () => {
    expect(computeContentHash(base)).toBe(computeContentHash({ ...base }))
  })

  it('normalizes whitespace/case so cosmetic diffs do not trigger AI', () => {
    const cosmetic = { ...base, description_md: 'Build  things.   Remote FRIENDLY.', title: '  Senior Engineer ' }
    expect(computeContentHash(cosmetic)).toBe(computeContentHash(base))
  })

  it('changes when material content changes', () => {
    expect(computeContentHash({ ...base, description_md: 'Now requires 5 years of Rust.' })).not.toBe(computeContentHash(base))
    expect(computeContentHash({ ...base, salary_range: '$200k-$250k' })).not.toBe(computeContentHash(base))
    expect(computeContentHash({ ...base, location: 'United States' })).not.toBe(computeContentHash(base))
    expect(computeContentHash({ ...base, is_remote: false })).not.toBe(computeContentHash(base))
  })

  it('handles null/undefined fields without throwing', () => {
    expect(() => computeContentHash({ title: null, description_md: null, location: null, country: null, salary_range: null, is_remote: null })).not.toThrow()
  })
})

describe('Phase 4D — ingest wires change detection (no timestamp-only re-runs)', () => {
  const run = read('lib/ingest/run.ts')
  it('persists content_hash and materially_changed_at on upsert', () => {
    expect(run).toContain('content_hash: newContentHash')
    expect(run).toContain('materially_changed_at:')
  })
  it('re-queues only when a PRIOR hash differs (never on first sight / timestamp)', () => {
    expect(run).toContain('existing?.content_hash && existing.content_hash !== newContentHash')
    expect(run).toContain('Material source change detected')
  })
})

describe('Phase 4D — evidence basis contract (source data vs AI analysis)', () => {
  const consolidated = read('lib/ai/verifiers/consolidated.ts')
  const engine = read('lib/ai/engine.ts')
  const ui = read('components/opportunity-intelligence.tsx')

  it('verifier classifies evidence basis (quote|regex|metadata)', () => {
    expect(consolidated).toContain('evidenceBasis')
    expect(consolidated).toContain('export type EvidenceBasis')
  })
  it('no synthesized sentence is injected into a *_evidence field', () => {
    expect(consolidated).not.toContain('out.remote_evidence = "Marked as remote in source feed"')
  })
  it('engine persists basis into evidence_refs', () => {
    expect(engine).toContain('basis: (aiResult as any).diags?._evidenceBasis')
  })
  it('UI labels verbatim source quotes and metadata-backed verdicts distinctly', () => {
    expect(ui).toContain('Source quote')
    expect(ui).toContain("basis === 'metadata'")
    expect(ui).toContain('basisOf')
  })
})
