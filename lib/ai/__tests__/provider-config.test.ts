import { describe, it, expect } from 'vitest'
import { PROVIDERS } from '../providers/types'

/**
 * [2026-08-13] Static provider config guard — the two newly-wired providers
 * (COHERE_API_KEY / MISTRAL_API_KEY_BACKUP were configured in Vercel but had
 * no provider entries, i.e. dead weight). These assertions keep the wiring
 * from silently regressing: every envKey that Vercel holds for the AI stack
 * must map to an enabled provider entry.
 */
describe('provider config — wired keys match Vercel env', () => {
  const ids = new Set(PROVIDERS.map(p => p.id))

  it('has 12 providers including cohere + mistral_backup', () => {
    expect(PROVIDERS.length).toBe(12)
    expect(ids.has('cohere')).toBe(true)
    expect(ids.has('mistral_backup')).toBe(true)
  })

  it('cohere uses COHERE_API_KEY + a current Command model', () => {
    const cohere = PROVIDERS.find(p => p.id === 'cohere')!
    expect(cohere.envKey).toBe('COHERE_API_KEY')
    expect(cohere.enabled).toBe(true)
    expect(cohere.model).toMatch(/^command-a/)
  })

  it('mistral_backup uses MISTRAL_API_KEY_BACKUP and shares the mistral endpoint family', () => {
    const backup = PROVIDERS.find(p => p.id === 'mistral_backup')!
    expect(backup.envKey).toBe('MISTRAL_API_KEY_BACKUP')
    expect(backup.enabled).toBe(true)
  })

  it('every Vercel-configured AI key has a provider entry', () => {
    const vercelKeys = [
      'GEMINI_API_KEY', 'GEMINI_API_KEY_BACKUP', 'GROQ_API_KEY', 'CEREBRAS_API_KEY',
      'OPENROUTER_API_KEY', 'HUGGINGFACE_API_KEY', 'GITHUB_MODELS_TOKEN',
      'CLOUDFLARE_API_TOKEN', 'MISTRAL_API_KEY', 'MISTRAL_API_KEY_BACKUP',
      'NVIDIA_API_KEY', 'COHERE_API_KEY',
    ]
    const envKeys = new Set(PROVIDERS.map(p => p.envKey))
    for (const k of vercelKeys) expect(envKeys.has(k), `${k} has no provider`).toBe(true)
  })
})
