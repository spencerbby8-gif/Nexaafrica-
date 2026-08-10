/**
 * Focused tests: deterministic-owner fallback in verifyJobReal.
 *
 * Root cause (verified in production): when the AI dimension abstained
 * ("unknown" — AI failure or regex gap), the JAI row stored unknown even
 * though a deterministic, evidence-backed owner existed. Live rows:
 * 59% of recent JAI rows africa_unknown, 56% company_unknown, while
 * jobs.eligibility said likely/explicit. The deterministic verifiers
 * (realAfricaEligibility / realCompanyLegitimacy) were dead code.
 *
 * Rules enforced here:
 *   - AI answer wins when present (never overwrite a real AI verdict)
 *   - deterministic owner fills in ONLY when AI is unknown
 *   - no invented evidence: deterministic verifiers return real matched text
 *   - a throwing deterministic verifier degrades to unknown, never crashes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/verifiers/consolidated', () => ({
  extractWithSingleAI: vi.fn(),
}))

import { extractWithSingleAI } from '@/lib/ai/verifiers/consolidated'
import { verifyJobReal } from '@/lib/ai/verifiers/index'

const mockExtract = extractWithSingleAI as unknown as ReturnType<typeof vi.fn>

function unknownConsolidated(): any {
  return {
    ai: {
      africa_eligibility: 'unknown', africa_confidence: 0, africa_evidence: null,
      country_restrictions: [], visa_sponsorship: 'unknown', visa_confidence: 0,
      remote_eligibility: 'unknown', remote_confidence: 0, remote_evidence: null,
      timezone_requirements: null, salary_min: null, salary_max: null,
      salary_currency: null, salary_period: null, salary_is_estimated: false,
      salary_transparency: 'unknown', salary_confidence: 0, salary_evidence: null,
      company_legitimacy: 'unknown', company_confidence: 0, company_evidence: null,
      job_quality: 'unknown', job_quality_confidence: 0, job_quality_evidence: null,
      experience_level: 'unknown', experience_confidence: 0,
      required_skills: [], transferable_skills: [], missing_skills: [],
      hiring_urgency: 'unknown', hiring_urgency_confidence: 0,
    },
    diags: [],
    modelVersion: 'no-ai-providers',
    pageFetched: false,
    pageLen: 0,
    pageStatus: null,
    aiUsed: false,
    companyPageFetched: false,
    companyPageLen: 0,
  }
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1', slug: 'job-1', title: 'Engineer', company: 'Acme',
    company_logo: null, description_md: 'Build software for customers worldwide.',
    apply_url: 'https://boards.greenhouse.io/acme/jobs/123', category: 'engineering',
    location: 'Remote', country: 'US', salary_range: null, salary_min: null,
    salary_max: null, salary_currency: null, salary_period: null,
    employment_type: 'full_time', tags: [], is_remote: true,
    is_open_to_africa: true, eligibility: 'likely', posted_at: new Date().toISOString(),
    created_at: new Date().toISOString(), expires_at: null, source: 'greenhouse:acme',
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    // Deterministic Africa verifier fetches the apply_url — return a page that
    // explicitly welcomes African applicants (real-text evidence).
    return new Response('<html><body>We welcome candidates from across Africa, including Nigeria, Kenya and Ghana. Apply now.</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  }))
})

describe('deterministic-owner fallback (Africa eligibility)', () => {
  it('uses the deterministic Africa verdict when AI says unknown', async () => {
    mockExtract.mockResolvedValue(unknownConsolidated())
    const bundle = await verifyJobReal(makeJob())
    expect(bundle.africa.eligibility).toBe('explicit') // page says "Africa, Nigeria, Kenya, Ghana"
    expect(bundle.africa.confidence).toBeGreaterThanOrEqual(80)
    expect(bundle.africa.evidence.toLowerCase()).toContain('africa')
    expect(bundle.africa.modelVersion).toBe('rule-based-v1 + web-research')
  })

  it('keeps the AI verdict when AI answered (never overwrite a real AI answer)', async () => {
    const c = unknownConsolidated()
    c.ai.africa_eligibility = 'likely'
    c.ai.africa_confidence = 75
    c.ai.africa_evidence = 'Worldwide hiring language'
    c.modelVersion = 'mistral:mistral-medium-2508'
    mockExtract.mockResolvedValue(c)
    const bundle = await verifyJobReal(makeJob())
    expect(bundle.africa.eligibility).toBe('likely')
    expect(bundle.africa.confidence).toBe(75)
    expect(bundle.africa.modelVersion).toBe('mistral:mistral-medium-2508')
  })

  it('stays unknown when the deterministic verifier also has no signal', async () => {
    mockExtract.mockResolvedValue(unknownConsolidated())
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body>Generic job page without signals.</body></html>', { status: 200 })))
    const bundle = await verifyJobReal(makeJob({ description_md: 'We are hiring a software engineer to join our team.' }))
    expect(bundle.africa.eligibility).toBe('unknown')
  })
})

describe('deterministic-owner fallback (company legitimacy)', () => {
  it('uses the deterministic ATS-based verdict when AI says unknown', async () => {
    mockExtract.mockResolvedValue(unknownConsolidated())
    // greenhouse.io apply_url => likely_legit per deterministic verifier
    const bundle = await verifyJobReal(makeJob({ apply_url: 'https://boards.greenhouse.io/acme/jobs/123' }))
    expect(bundle.company.legitimacy).toBe('likely_legit')
    expect(bundle.company.confidence).toBe(60)
    expect(bundle.company.evidence).toContain('greenhouse.io')
    expect(bundle.company.modelVersion).toBe('rule-based-v1')
  })

  it('keeps the AI company verdict when AI answered', async () => {
    const c = unknownConsolidated()
    c.ai.company_legitimacy = 'verified'
    c.ai.company_confidence = 80
    c.modelVersion = 'cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    mockExtract.mockResolvedValue(c)
    const bundle = await verifyJobReal(makeJob({ apply_url: 'https://some-unknown-site.example/jobs/1' }))
    expect(bundle.company.legitimacy).toBe('verified')
    expect(bundle.company.modelVersion).toBe('cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast')
  })

  it('does not crash when the deterministic verifier throws (degrades to unknown)', async () => {
    mockExtract.mockResolvedValue(unknownConsolidated())
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    // Neutral apply URL (not an ATS host): company verifier has no signal either.
    const bundle = await verifyJobReal(makeJob({ apply_url: 'https://example.com/careers/1', description_md: 'We are hiring a software engineer to join our team.' }))
    expect(bundle.company.legitimacy).toBe('unknown')
    expect(bundle.africa.eligibility).toBe('unknown')
  })
})
