export type ProviderId = "cerebras" | "gemini" | "gemini_backup" | "groq" | "openrouter" | "huggingface"

export interface ProviderConfig {
  id: ProviderId; name: string; envKey: string; model: string; enabled: boolean
  priority: number; rateLimitPerSec: number; timeoutMs: number; costPer1kTokens: number
}

export const PROVIDERS: ProviderConfig[] = [
  // Gemini: free-tier 429 at >20 RPM. Works for single requests (CV parsing).
  { id: "gemini", name: "Gemini 2.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-2.5-flash", enabled: true, priority: 1, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  { id: "gemini_backup", name: "Gemini Backup", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-2.5-flash", enabled: false, priority: 2, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  { id: "groq", name: "Groq Llama 3.3", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", enabled: true, priority: 3, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  // Cerebras: verified working. GET /v1/models confirmed gpt-oss-120b.
  // Probe: 200 OK, 122ms, valid inference with 81 tokens.
  { id: "cerebras", name: "Cerebras GPT-OSS 120B", envKey: "CEREBRAS_API_KEY", model: "gpt-oss-120b", enabled: true, priority: 4, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  // OpenRouter: key locked to together/deepinfra routing at account level.
  // GET /api/v1/models: 200, 50+ models listed. But ALL inference attempts fail:
  //   - google/gemini-3.6-flash: 404 (needs google-ai-studio, key doesn't have it)
  //   - google/gemini-3.6-flash + provider routing: 404 (provider field ignored)
  //   - google/gemini-3.5-flash-lite + provider routing: 404
  //   - moonshotai/kimi-k3: 404
  // requested_providers always ["together","deepinfra"] regardless of model or
  // provider routing override. This is an account-level restriction.
  // Until the key owner adds google-ai-studio routing, OpenRouter cannot be used.
  { id: "openrouter", name: "OpenRouter Gemini", envKey: "OPENROUTER_API_KEY", model: "google/gemini-3.6-flash", enabled: false, priority: 5, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 3 },
  // HuggingFace: "fetch failed" in Vercel serverless. Cannot reach HF inference API.
  { id: "huggingface", name: "HuggingFace", envKey: "HUGGINGFACE_API_KEY", model: "HuggingFaceH4/zephyr-7b-beta", enabled: false, priority: 6, rateLimitPerSec: 2, timeoutMs: 20000, costPer1kTokens: 1 },
]

export interface ProviderHealth {
  id: ProviderId; isHealthy: boolean; lastSuccessAt: string | null; lastFailedAt: string | null
  consecutiveFailures: number; totalRequests: number; failedRequests: number
  failureRate: number; avgLatencyMs: number | null; lastError?: string; enabled: boolean
}
