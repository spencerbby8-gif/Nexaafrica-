import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the gateway (first AI call) and the orchestrator (JSON retry pass).
vi.mock('../gateway', () => ({ aiGateway: vi.fn() }))
vi.mock('../orchestrator', () => ({ orchestrate: vi.fn() }))

import { aiGateway } from '../gateway'
import { orchestrate } from '../orchestrator'
import { extractWithSingleAI } from '../verifiers/consolidated'
import { resetRouterHealthForTesting, getRouterHealthSnapshot } from '../smart-router'

/**
 * Verifier JSON-retry behavior — the real production case:
 * gemma-2b returns HTTP 200 with unparseable prose → the verifier must treat
 * it as a router failure and hand the job to the next JSON-capable provider
 * (mistral) instead of silently persisting a regex-fallback row.
 */

const ATS_URL = 'https://boards.greenhouse.io/acme/jobs/1'

const job: any = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Senior Engineer',
  company: 'Acme',
  location: 'Remote',
  country: 'Worldwide',
  description_md:
    'Acme is hiring a Senior Engineer to work remotely worldwide. We offer a competitive salary of $100,000 USD per year. ' +
    'You will build APIs, databases and microservices. ' +
    'We are a global remote-first company with teams across EMEA and the Americas.'.repeat(1),
  apply_url: ATS_URL,
  category: 'engineering',
  salary_range: '$100,000 USD',
  salary_min: 100000,
  salary_max: 100000,
  salary_currency: 'USD',
  is_remote: true,
  source: 'greenhouse',
  employment_type: 'full_time',
  tags: ['engineering', 'backend'],
  posted_at: new Date().toISOString(),
}

const validJson = JSON.stringify({
  africa_eligibility: 'likely', africa_confidence: 60, africa_evidence: 'We hire worldwide',
  country_restrictions: [], visa_sponsorship: 'unknown', visa_confidence: 0,
  remote_eligibility: 'fully_remote', remote_confidence: 85, remote_evidence: 'remote-first company',
  timezone_requirements: null, salary_min: 100000, salary_max: 100000, salary_currency: 'USD',
  salary_period: 'year', salary_is_estimated: false, salary_transparency: 'disclosed',
  salary_confidence: 70, salary_evidence: 'Salary of $100,000 USD',
  company_legitimacy: 'unknown', company_confidence: 0, company_evidence: null,
  job_quality: 'medium', job_quality_confidence: 50, job_quality_evidence: 'Comprehensive posting',
  experience_level: 'mid', experience_confidence: 60, required_skills: ['typescript'],
  transferable_skills: [], missing_skills: [], hiring_urgency: 'medium', hiring_urgency_confidence: 40,
})

const gatewayOk = (text: string, provider: string, model: string, chain: string[] = [provider]) => ({
  response: { text, provider, model, latencyMs: 7000 },
  fallbackUsed: chain.length > 1,
  fallbackChain: chain,
  diag: [],
})

const fetchStub = vi.fn(async (url: string) => ({
  ok: true,
  status: 200,
  text: async () => '<html><body>Acme — a global remote-first company hiring engineers worldwide. Careers page.</body></html>',
}))

beforeEach(() => {
  vi.clearAllMocks()
  resetRouterHealthForTesting()
  vi.stubGlobal('fetch', fetchStub)
  ;(aiGateway as any).mockResolvedValue(gatewayOk(validJson, 'mistral', 'mistral-medium-2505'))
  ;(orchestrate as any).mockResolvedValue(gatewayOk(validJson, 'mistral', 'mistral-medium-2505'))
})

describe('verifier JSON retry — unusable fast-model output must re-route, not fall back', () => {
  it('gemma-2b garbage → one retry via orchestrator → mistral JSON accepted (the production case)', async () => {
    ;(aiGateway as any).mockResolvedValue(gatewayOk(
      'I cannot provide the JSON you asked for. The job is for a Senior Engineer...',
      'cloudflare', '@cf/google/gemma-2b-it-lora',
    ))
    const result = await extractWithSingleAI(job)
    expect(result.aiUsed).toBe(true)
    expect(result.modelVersion).toBe('mistral:mistral-medium-2505')
    // exactly one retry — bounded
    expect(aiGateway).toHaveBeenCalledTimes(1)
    expect(orchestrate).toHaveBeenCalledTimes(1)
    // the unusable provider was recorded as a router failure (cooldown + re-rank)
    const snapshot = getRouterHealthSnapshot()
    const cf = snapshot.find(s => s.id === 'cloudflare')!
    expect(cf.consecutiveFailures).toBeGreaterThan(0)
    // diagnostic event is visible for observability
    const parseFail = result.diags.filter(d => d.errorCode === 'JSON_PARSE_FAILED')
    expect(parseFail.length).toBeGreaterThan(0)
    expect(parseFail[0].provider).toBe('cloudflare')
  })

  it('garbage → garbage: bounded to 2 total AI calls, falls back to regex with an honest label', async () => {
    ;(aiGateway as any).mockResolvedValue(gatewayOk('This is not JSON at all.', 'cloudflare', '@cf/google/gemma-2b-it-lora'))
    ;(orchestrate as any).mockResolvedValue(gatewayOk('Also not JSON. Sorry.', 'mistral', 'mistral-medium-2505'))
    const result = await extractWithSingleAI(job)
    expect(result.aiUsed).toBe(false)
    expect(result.modelVersion.startsWith('regex-extracted-')).toBe(true)
    expect(aiGateway).toHaveBeenCalledTimes(1)
    expect(orchestrate).toHaveBeenCalledTimes(1)
  })

  it('first call already valid: no retry at all', async () => {
    ;(aiGateway as any).mockResolvedValue(gatewayOk(validJson, 'cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'))
    const result = await extractWithSingleAI(job)
    expect(result.aiUsed).toBe(true)
    expect(result.modelVersion).toBe('cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast')
    expect(orchestrate).not.toHaveBeenCalled()
  })

  it('chain already walked multiple providers: no extra retry (bounded)', async () => {
    ;(aiGateway as any).mockResolvedValue(gatewayOk(
      'Garbage from the last fallback provider.',
      'nvidia', 'meta/llama-3.1-70b-instruct',
      ['mistral', 'huggingface', 'nvidia'],
    ))
    const result = await extractWithSingleAI(job)
    expect(result.aiUsed).toBe(false)
    expect(orchestrate).not.toHaveBeenCalled()
    expect(aiGateway).toHaveBeenCalledTimes(1)
  })

  it('never emits regex-extracted-0bytes: dead page + failed AI → stored-description label', async () => {
    const shortJob: any = {
      ...job,
      description_md: 'Remote worldwide engineer $100,000', // < 100 chars → pageText 0 via ATS path
    }
    ;(aiGateway as any).mockResolvedValue(gatewayOk('no json here', 'cloudflare', '@cf/google/gemma-2b-it-lora'))
    ;(orchestrate as any).mockResolvedValue(gatewayOk('still no json', 'mistral', 'mistral-medium-2505'))
    const result = await extractWithSingleAI(shortJob)
    expect(result.pageLen).toBe(0)
    expect(result.modelVersion).toBe('regex-extracted-from-stored-description')
    expect(result.modelVersion).not.toContain('0bytes')
  })

  it('retry is bounded even when the retry call throws (all providers down)', async () => {
    ;(aiGateway as any).mockResolvedValue(gatewayOk('garbage', 'cloudflare', '@cf/google/gemma-2b-it-lora'))
    ;(orchestrate as any).mockRejectedValue(Object.assign(new Error('All providers unhealthy — no routing candidates'), { diag: [] }))
    const result = await extractWithSingleAI(job)
    expect(result.aiUsed).toBe(false)
    expect(aiGateway).toHaveBeenCalledTimes(1)
    expect(orchestrate).toHaveBeenCalledTimes(1)
    // no exception escapes the verifier
    expect(result.modelVersion).toBeTruthy()
  })
})
