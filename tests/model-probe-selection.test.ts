/**
 * Focused tests for Gemini probe/verification model selection.
 *
 * The audit route and model-sync both decide WHICH Gemini models get live
 * verification calls. Selecting dead models (the old hardcoded list:
 * gemini-2.5-flash / 2.5-pro / 2.0-flash / 1.5-flash / 1.5-pro) wasted quota
 * on guaranteed 404s and left the live 3.x models never tested. These tests
 * lock in the selection rules: configured first, non-text filtered, stable
 * current models preferred, capped.
 */

import { describe, it, expect } from 'vitest'
import { selectGeminiProbeModels } from '@/lib/ai/model-discovery'

const LIVE_CATALOG = [
  'models/gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'lyria-3-clip-preview',
  'nano-banana-pro-preview',
  'deep-research-preview-04-2026',
  'gemini-robotics-er-1.5-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-computer-use-preview-10-2025',
  'antigravity-preview-05-2026',
]

describe('selectGeminiProbeModels', () => {
  it('puts configured models first, then preferred live text models', () => {
    const sel = selectGeminiProbeModels(
      LIVE_CATALOG.map((id) => id.replace('models/', '')),
      ['gemini-3.5-flash', 'gemini-3.1-flash-lite'],
      5,
    )
    expect(sel[0]).toBe('gemini-3.5-flash')
    expect(sel[1]).toBe('gemini-3.1-flash-lite')
    // stable 3.x preferred over legacy 2.x
    const idx3_6 = sel.indexOf('gemini-3.6-flash')
    const idx2_5lite = sel.indexOf('gemini-2.5-flash-lite')
    if (idx3_6 !== -1 && idx2_5lite !== -1) expect(idx3_6).toBeLessThan(idx2_5lite)
  })

  it('never returns non-text model families (image/tts/lyria/robotics/etc.)', () => {
    const sel = selectGeminiProbeModels(LIVE_CATALOG.map((id) => id.replace('models/', '')), [], 20)
    expect(sel).not.toContain('gemini-3.1-flash-image')
    expect(sel).not.toContain('gemini-2.5-flash-image')
    expect(sel).not.toContain('lyria-3-clip-preview')
    expect(sel).not.toContain('nano-banana-pro-preview')
    expect(sel).not.toContain('deep-research-preview-04-2026')
    expect(sel).not.toContain('gemini-robotics-er-1.5-preview')
    expect(sel).not.toContain('gemini-2.5-flash-preview-tts')
    expect(sel).not.toContain('gemini-2.5-computer-use-preview-10-2025')
    expect(sel).not.toContain('antigravity-preview-05-2026')
    expect(sel).not.toContain('models/gemini-2.5-flash') // no prefix leakage
  })

  it('prefers stable current models over shutdown legacy ones', () => {
    const sel = selectGeminiProbeModels(LIVE_CATALOG, [], 10)
    const dead = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-001']
    // live stable models must appear before any dead legacy model
    for (const d of dead) {
      const di = sel.indexOf(d)
      if (di === -1) continue
      for (const live of ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']) {
        const li = sel.indexOf(live)
        if (li !== -1) expect(li).toBeLessThan(di)
      }
    }
  })

  it('respects the cap and never exceeds it', () => {
    expect(selectGeminiProbeModels(LIVE_CATALOG, [], 3).length).toBe(3)
    expect(selectGeminiProbeModels(LIVE_CATALOG, ['gemini-3.5-flash'], 1).length).toBe(1)
  })

  it('dedupes configured models that also appear in the catalog', () => {
    const sel = selectGeminiProbeModels(
      ['gemini-3.5-flash', 'gemini-3.6-flash'],
      ['gemini-3.5-flash'],
      5,
    )
    expect(sel.filter((m) => m === 'gemini-3.5-flash').length).toBe(1)
  })

  it('handles empty catalog gracefully (configured models still returned)', () => {
    const sel = selectGeminiProbeModels([], ['gemini-3.5-flash', 'gemini-3.1-flash-lite'], 5)
    expect(sel).toEqual(['gemini-3.5-flash', 'gemini-3.1-flash-lite'])
    expect(selectGeminiProbeModels([], [], 5)).toEqual([])
  })
})
