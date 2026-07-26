export type ProviderId = "cerebras" | "gemini" | "gemini_backup" | "groq" | "openrouter" | "huggingface"

export interface ProviderConfig {
  id: ProviderId; name: string; envKey: string; model: string; enabled: boolean
  priority: number; rateLimitPerSec: number; timeoutMs: number; costPer1kTokens: number
}

export const PROVIDERS: ProviderConfig[] = [
  // Gemini: free-tier 429 at >20 RPM. Works for single requests (CV parsing).
  { id: "gemini", name: "Gemini 2.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-2.5-flash", enabled: true, priority: 1, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  { id: "gemini_backup", name: "Gemini Backup", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-2.5-flash", enabled: false, priority: 2, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  // Groq: proven working. On-demand: 100K TPD, ~30 RPM.
  { id: "groq", name: "Groq Llama 3.3", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", enabled: true, priority: 3, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  // Cerebras: verified working. GET /v1/models confirmed gpt-oss-120b.
  // Probe: 200 OK, 122ms, valid inference with 81 tokens.
  { id: "cerebras", name: "Cerebras GPT-OSS 120B", envKey: "CEREBRAS_API_KEY", model: "gpt-oss-120b", enabled: true, priority: 4, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  // OpenRouter: free-tier key (is_free_tier:true), zero usage. 8 routing tests:
  //   openrouter/free × 5 (nvidia/poolside/darkbloom/novita routing): 404 — all routed to together/deepinfra
  //   google/gemini-2.5-flash × 2 (google-ai-studio routing): 404 — routed to together/deepinfra
  //   meta-llama/llama-4-maverick via together: 404 "No endpoints found"
  //   meta-llama/llama-4-maverick via deepinfra: ✅ 200 OK, 392ms, "ok" response, 13+2 tokens
  // The provider field in the request body is IGNORED by OpenRouter — routing
  // is determined solely by which model slug is requested. deepinfra serves
  // meta-llama/llama-4-maverick; nothing serves openrouter/free or Gemini models.
  // Definitively: provider routing override doesn't work on free-tier accounts.
  // Re-enabled with working model + disabled provider routing.
  { id: "openrouter", name: "OpenRouter Llama 4", envKey: "OPENROUTER_API_KEY", model: "meta-llama/llama-4-maverick", enabled: true, priority: 5, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 0 },
  // HuggingFace: "fetch failed" in Vercel serverless.
  { id: "huggingface", name: "HuggingFace", envKey: "HUGGINGFACE_API_KEY", model: "HuggingFaceH4/zephyr-7b-beta", enabled: false, priority: 6, rateLimitPerSec: 2, timeoutMs: 20000, costPer1kTokens: 1 },
]

export interface ProviderHealth {
  id: ProviderId; isHealthy: boolean; lastSuccessAt: string | null; lastFailedAt: string | null
  consecutiveFailures: number; totalRequests: number; failedRequests: number
  failureRate: number; avgLatencyMs: number | null; lastError?: string; enabled: boolean
}
