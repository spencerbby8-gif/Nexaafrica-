import { describe, expect, it } from 'vitest'
import { hasAIReasoning, hasAfricaAIReasoning } from '@/components/opportunity-intelligence'

describe('Phase 4G — truthful AI-vs-heuristic detection', () => {
  it('hasAIReasoning is false when there is no reasoning (heuristic rows)', () => {
    expect(hasAIReasoning(null)).toBe(false)
    expect(hasAIReasoning({} as any)).toBe(false)
    expect(hasAIReasoning({ evidence_refs: {} } as any)).toBe(false)
    expect(hasAIReasoning({ evidence_refs: { reasoning: null } } as any)).toBe(false)
    expect(hasAIReasoning({ evidence_refs: { reasoning: { africa: null, remote: null } } } as any)).toBe(false)
    expect(hasAIReasoning({ evidence_refs: { reasoning: { africa: '   ' } } } as any)).toBe(false)
  })
  it('hasAIReasoning is true only when real AI reasoning exists', () => {
    expect(hasAIReasoning({ evidence_refs: { reasoning: { africa: 'Role explicitly covers EMEA.' } } } as any)).toBe(true)
    expect(hasAIReasoning({ evidence_refs: { reasoning: { remote: 'Posting states fully remote.' } } } as any)).toBe(true)
  })
  it('hasAfricaAIReasoning only true for non-empty Africa reasoning', () => {
    expect(hasAfricaAIReasoning({ evidence_refs: { reasoning: { africa: null } } } as any)).toBe(false)
    expect(hasAfricaAIReasoning({ evidence_refs: { reasoning: { africa: 'Covers EMEA incl. Africa.' } } } as any)).toBe(true)
  })
})
