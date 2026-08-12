import { describe, it, expect, vi, beforeEach } from 'vitest'

// profile/gemini.ts starts with `import "server-only"` — no-op in tests.
vi.mock('server-only', () => ({}))

vi.mock('../../ai/gateway', () => ({ aiGateway: vi.fn() }))
vi.mock('../../ai/orchestrator', () => ({ orchestrate: vi.fn() }))

import { aiGateway } from '../../ai/gateway'
import { orchestrate } from '../../ai/orchestrator'
import { parseCvWithGemini } from '../gemini'

/**
 * CV retry — the REAL production bug (2026-08-12):
 * the first fix attempt wrapped only validateParsedProfile in the retry
 * try/catch, but JSON.parse(text) threw BEFORE it (the catch block re-threw
 * on the cleaned string). So when mistral returned unparseable output
 * (9x JSON_PARSE_FAILED that day), CV never retried → broken transformation.
 * Now parsing is null-safe and the retry wraps parse + validate.
 */

const CV_TEXT = 'Full-stack developer with 5 years experience at Acme building React and Node products. Led a team of 4 engineers.'

const validJson = JSON.stringify({
  headline: 'Full-Stack Engineer | Product Builder',
  summary: 'Full-stack engineer who ships products end-to-end. Led a 4-person team at Acme.',
  skills: ['React', 'Node.js', 'TypeScript', 'Leadership'],
  experience: [
    { title: 'Senior Engineer', company: 'Acme', start_date: '2021', end_date: 'Present', description: 'Led product engineering for core platform.' },
  ],
})

const gwOk = (text: string, provider: string, model: string) => ({
  response: { text, provider, model, latencyMs: 7000, tokensInput: 10, tokensOutput: 20 },
  fallbackUsed: false,
  fallbackChain: [provider],
  diag: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(aiGateway as any).mockResolvedValue(gwOk(validJson, 'mistral', 'mistral-medium-2508'))
  ;(orchestrate as any).mockResolvedValue(gwOk(validJson, 'gemini_backup', 'gemini-3.5-flash-lite'))
})

describe('parseCvWithGemini — bounded retry on unusable output', () => {
  it('BUG REPRO: unparseable first output → retry fires → success from backup provider', async () => {
    // mistral returns prose (the 2026-08-12 failure mode)
    ;(aiGateway as any).mockResolvedValue(gwOk('I cannot provide JSON. Here is a summary of the CV...', 'mistral', 'mistral-medium-2508'))
    const result = await parseCvWithGemini(CV_TEXT)
    expect(result.provider).toBe('gemini_backup')
    expect(result.model).toBe('gemini-3.5-flash-lite')
    expect(result.parsed.headline).toContain('Full-Stack Engineer')
    // exactly one retry
    expect(aiGateway).toHaveBeenCalledTimes(1)
    expect(orchestrate).toHaveBeenCalledTimes(1)
  })

  it('markdown-fenced JSON on first attempt parses WITHOUT retry', async () => {
    ;(aiGateway as any).mockResolvedValue(gwOk('```json\n' + validJson + '\n```', 'mistral', 'mistral-medium-2508'))
    const result = await parseCvWithGemini(CV_TEXT)
    expect(result.provider).toBe('mistral')
    expect(orchestrate).not.toHaveBeenCalled()
  })

  it('garbage → garbage: bounded to 2 calls, surfaces the ORIGINAL error', async () => {
    ;(aiGateway as any).mockResolvedValue(gwOk('garbage one', 'mistral', 'mistral-medium-2508'))
    ;(orchestrate as any).mockResolvedValue(gwOk('garbage two', 'gemini_backup', 'gemini-3.5-flash-lite'))
    await expect(parseCvWithGemini(CV_TEXT)).rejects.toThrow('Profile is not an object.')
    expect(aiGateway).toHaveBeenCalledTimes(1)
    expect(orchestrate).toHaveBeenCalledTimes(1)
  })

  it('valid output on first attempt: no retry at all', async () => {
    const result = await parseCvWithGemini(CV_TEXT)
    expect(result.provider).toBe('mistral')
    expect(orchestrate).not.toHaveBeenCalled()
  })

  it('retry throws (all providers down) → surfaces the original error, no exception leak', async () => {
    ;(aiGateway as any).mockResolvedValue(gwOk('garbage', 'mistral', 'mistral-medium-2508'))
    ;(orchestrate as any).mockRejectedValue(Object.assign(new Error('All providers unhealthy — no routing candidates'), { diag: [] }))
    await expect(parseCvWithGemini(CV_TEXT)).rejects.toThrow('Profile is not an object.')
    expect(orchestrate).toHaveBeenCalledTimes(1)
  })
})
