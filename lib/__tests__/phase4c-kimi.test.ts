import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROVIDERS } from '@/lib/ai/providers/types'

/**
 * [PHASE-4C] FreeRouter / Kimi K3 integration guarantees:
 *  - freerouter is a first-class provider (env-keyed, routed, discovered)
 *  - kimi-k3 is the INITIAL configured preference, never hardcoded-permanent:
 *    dynamic registry prefers the configured model only until measured
 *    benchmarks outrank it.
 *  - reasoning models get probe budgets/timeouts that measure capability,
 *    not token-budget starvation.
 *  - underlying model identity is preserved in provenance.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('freerouter provider registration', () => {
  const fr = PROVIDERS.find((p) => p.id === 'freerouter')
  it('registers freerouter on FREEROUTER_API_KEY with kimi-k3 as initial model', () => {
    expect(fr).toBeTruthy()
    expect(fr!.envKey).toBe('FREEROUTER_API_KEY')
    expect(fr!.model).toBe('kimi-k3')
    expect(fr!.enabled).toBe(true)
  })
  it('covers intelligence tasks', () => {
    expect(fr!.taskTypes).toContain('job_intelligence')
    expect(fr!.taskTypes).toContain('fallback')
  })
  it('is dispatchable in the gateway', () => {
    const gw = read('lib/ai/gateway.ts')
    expect(gw).toMatch(/openAICompat: ProviderId\[\] = \[[^\]]*"freerouter"[^\]]*\]/)
    expect(gw).toContain('https://freerouter.eu.cc/v1/chat/completions')
  })
})

describe('underlying-model provenance', () => {
  it('gateway preserves the model the gateway actually returned', () => {
    const gw = read('lib/ai/gateway.ts')
    expect(gw).toContain('resolvedModel')
    expect(gw).toMatch(/freerouter[\s\S]{0,160}data\?\.model/)
  })
})

describe('dynamic preference, not permanent hardcode', () => {
  it('registry keeps configured preference only until benchmarks outrank it', () => {
    const reg = read('lib/ai/providers/dynamic-registry.ts')
    // benchmark scores dominate...
    expect(reg).toContain('overallScore')
    // ...and configured preference is a tie-break applied ONLY when there are
    // no benchmarks (measured quality always wins).
    expect(reg).toMatch(/benchmarked\.length > 0[\s\S]{0,220}provider\.model \? 0 : 1/)
  })
  it('discovery is wired to the freerouter models endpoint', () => {
    const disc = read('lib/ai/model-discovery.ts')
    expect(disc).toContain('https://freerouter.eu.cc/v1/models')
  })
})

describe('reasoning-model probe headroom', () => {
  it('freerouter probes use a large token budget + full provider timeout', () => {
    const sync = read('lib/ai/model-sync.ts')
    expect(sync).toMatch(/freerouter' \? 8192 : 16/)
    expect(sync).toMatch(/provider === 'freerouter'/)
  })
})

describe('structured ATS evidence source', () => {
  it('collects Greenhouse official job API evidence', () => {
    const ev = read('lib/ai/evidence.ts')
    expect(ev).toContain('boards.greenhouse.io')
    expect(ev).toContain('greenhouse_jobs_api')
  })
})
