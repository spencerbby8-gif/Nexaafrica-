import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROVIDERS } from '@/lib/ai/providers/types'
import { parseLlm7ModelList } from '@/lib/ai/model-discovery'

/**
 * [PHASE-4] LLM7 integration contract: registered in the provider mesh,
 * OpenAI-compatible endpoints wired through gateway + model-sync, discovery
 * parser robust to gateway payload shapes. Model IDs are never hardcoded —
 * selection comes from discovery + live probes (measured truth).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('LLM7 provider registration', () => {
  const llm7 = PROVIDERS.find((p) => p.id === 'llm7')
  const llm7Fast = PROVIDERS.find((p) => p.id === 'llm7_fast')

  it('registers default + fast routing entries on LLM7_API_KEY', () => {
    expect(llm7).toBeTruthy()
    expect(llm7Fast).toBeTruthy()
    expect(llm7!.envKey).toBe('LLM7_API_KEY')
    expect(llm7Fast!.envKey).toBe('LLM7_API_KEY')
    expect(llm7!.model).toBe('default')
    expect(llm7Fast!.model).toBe('fast')
    expect(llm7!.enabled).toBe(true)
    expect(llm7Fast!.enabled).toBe(true)
  })

  it('covers Nexa intelligence tasks (incl. job_intelligence)', () => {
    expect(llm7!.taskTypes).toContain('job_intelligence')
    expect(llm7!.taskTypes).toContain('fallback')
    expect(llm7Fast!.taskTypes).toContain('fast_extraction')
  })

  it('gateway maps both entries to the OpenAI-compatible llm7 endpoint', () => {
    const gw = read('lib/ai/gateway.ts')
    expect(gw).toMatch(/llm7:\s*"https:\/\/api\.llm7\.io\/v1\/chat\/completions"/)
    expect(gw).toMatch(/llm7_fast:\s*"https:\/\/api\.llm7\.io\/v1\/chat\/completions"/)
  })

  it('model-sync probes llm7 with plain prompts (free tier has no JSON mode)', () => {
    const sync = read('lib/ai/model-sync.ts')
    expect(sync).toContain("llm7: 'https://api.llm7.io/v1/chat/completions'")
    expect(sync).toContain("llm7_fast: 'https://api.llm7.io/v1/chat/completions'")
  })

  it('discovery is wired behind LLM7_API_KEY', () => {
    const disc = read('lib/ai/model-discovery.ts')
    expect(disc).toContain('discoverLlm7Models(process.env.LLM7_API_KEY)')
  })
})

describe('LLM7 model list parser', () => {
  it('maps OpenAI-style payloads and drops routing selectors', () => {
    const models = parseLlm7ModelList({
      data: [
        { id: 'gpt-4.1-nano-2025-04-14', provider: 'openai', contextWindow: 5000, toolCalling: true },
        { id: 'mistral-small-3.1-24b-instruct-2503', provider: 'mistral' },
        { id: 'default' },
        { id: 'fast' },
        { id: 'pro' },
        { name: 'only-name-model' },
        {},
      ],
    })
    expect(models.map((m) => m.modelId)).toEqual([
      'gpt-4.1-nano-2025-04-14',
      'mistral-small-3.1-24b-instruct-2503',
      'only-name-model',
    ])
    expect(models.every((m) => m.provider === 'llm7')).toBe(true)
    expect(models.every((m) => m.health.usable === false)).toBe(true) // measured later by probes
  })

  it('tolerates bare arrays and garbage', () => {
    expect(parseLlm7ModelList([{ id: 'x' }]).length).toBe(1)
    expect(parseLlm7ModelList(null)).toEqual([])
    expect(parseLlm7ModelList({ nope: true })).toEqual([])
  })
})
