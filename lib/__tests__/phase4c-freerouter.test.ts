import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROVIDERS } from '@/lib/ai/providers/types'
import { parseFreeRouterModelList } from '@/lib/ai/model-discovery'
import { enforceTruthfulness } from '@/lib/ai/verifiers/consolidated'

/**
 * [PHASE-4C] FreeRouter integration + reasoning truth guards.
 * Kimi K3 is the INITIAL preferred model — never pinned: discovery + probes
 * govern measured standing like every other provider.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('FreeRouter provider integration', () => {
  const fr = PROVIDERS.find((p) => p.id === 'freerouter')

  it('registers freerouter on FREEROUTER_API_KEY with Kimi K3 initial preference', () => {
    expect(fr).toBeTruthy()
    expect(fr!.envKey).toBe('FREEROUTER_API_KEY')
    expect(fr!.model).toBe('kimi-k3') // initial preference only — registry can swap it
    expect(fr!.enabled).toBe(true)
    expect(fr!.taskTypes).toContain('job_intelligence')
  })

  it('wires the freerouter.eu.cc OpenAI-compatible endpoints', () => {
    const gw = read('lib/ai/gateway.ts')
    expect(gw).toContain('freerouter: "https://freerouter.eu.cc/v1/chat/completions"')
    expect(gw.split(String.fromCharCode(10)).some((l: string) => l.includes('openAICompat') && l.includes('freerouter'))).toBe(true)
    const sync = read('lib/ai/model-sync.ts')
    expect(sync).toContain("freerouter: 'https://freerouter.eu.cc/v1/chat/completions'")
    const disc = read('lib/ai/model-discovery.ts')
    expect(disc).toContain('discoverFreeRouterModels(process.env.FREEROUTER_API_KEY)')
  })

  it('preserves the actual underlying model identity in provenance', () => {
    const gw = read('lib/ai/gateway.ts')
    // The real model reported by the gateway wins provenance; the router's
    // identity header is the fallback; only then the configured model.
    expect(gw).toContain('X-Free-Router-Model')
    expect(gw).toContain('const resolvedModel = providerId === "freerouter"')
    expect(gw).toContain('model: resolvedModel')
  })

  it('parses the gateway catalog payload', () => {
    const models = parseFreeRouterModelList({
      data: [
        { id: 'kimi-k3', name: 'Kimi K3', contextWindow: 1000000, owned_by: 'ai2' },
        { id: 'glm-5.2', name: 'GLM 5.2', contextWindow: 1000000 },
        {},
      ],
    })
    expect(models.map((m) => m.modelId)).toEqual(['kimi-k3', 'glm-5.2'])
    expect(models[0].capabilities.maxTokens).toBe(1000000)
    expect(models.every((m) => m.provider === 'freerouter')).toBe(true)
  })
})

describe('reasoning truth guards', () => {
  const baseJob: any = {
    id: 'j1', title: 'Engineer', company: 'Acme', apply_url: 'https://x.test/job',
    location: 'Remote', country: 'Worldwide', is_remote: true, description_md: 'work from anywhere worldwide',
    salary_range: null, salary_min: null, salary_max: null, salary_currency: null, salary_period: null, tags: [],
  }

  const merged: any = {
    africa_eligibility: 'likely', africa_confidence: 60, africa_evidence: 'work from anywhere worldwide',
    africa_reasoning: 'Posting says "anywhere worldwide" with no location limits.',
    remote_eligibility: 'unknown', remote_confidence: 0, remote_evidence: null,
    remote_reasoning: 'This should be dropped because remote abstained.',
    salary_transparency: 'unknown', salary_confidence: 0, salary_evidence: null,
    salary_reasoning: 'dropped too',
    company_legitimacy: 'unknown', company_confidence: 0, company_evidence: null,
    company_reasoning: 'dropped',
    experience_level: 'unknown', experience_confidence: 0, experience_reasoning: 'dropped',
    job_quality: 'unknown', job_quality_confidence: 0, job_quality_evidence: null, quality_reasoning: 'dropped',
    country_restrictions: [], visa_sponsorship: 'unknown', visa_confidence: 0,
    timezone_requirements: null, salary_min: null, salary_max: null, salary_is_estimated: false,
  }

  it('keeps reasoning for concluded dimensions, drops it for abstained ones', () => {
    const out: any = enforceTruthfulness(merged, { job: baseJob, truth: baseJob.description_md, jobTruth: baseJob.description_md, hasCompanyPage: false })
    expect(out.africa_reasoning).toContain('anywhere worldwide')
    expect(out.remote_reasoning).toBeNull()
    expect(out.salary_reasoning).toBeNull()
    expect(out.company_reasoning).toBeNull()
    expect(out.experience_reasoning).toBeNull()
    expect(out.quality_reasoning).toBeNull()
  })

  it('prompt demands job-specific grounded reasoning and null-when-unknown', () => {
    const cons = read('lib/ai/verifiers/consolidated.ts')
    expect(cons).toContain('*_reasoning fields: ONE short sentence')
    expect(cons).toContain('null whenever the field is unknown')
    expect(cons).toContain('"africa_reasoning"')
    expect(cons).toContain('"quality_reasoning"')
  })

  it('engine persists reasoning into evidence_refs', () => {
    const engine = read('lib/ai/engine.ts')
    expect(engine).toContain('reasoning: (aiResult as any).diags?._reasoning ?? null')
  })
})

describe('verifier output budget', () => {
  it('requests enough tokens for the full schema + quotes + reasoning (no mid-JSON truncation)', () => {
    const v = read('lib/ai/verifiers/consolidated.ts')
    const calls = v.match(/maxTokens: (\d+)/g) || []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) {
      const n = Number(c.replace('maxTokens: ', ''))
      expect(n, 'verifier budget must cover the 30-field schema with reasoning').toBeGreaterThanOrEqual(2500)
    }
  })
})
