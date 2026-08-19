export type ProviderId = "cerebras" | "gemini" | "gemini_backup" | "groq" | "openrouter" | "huggingface" | "github_models" | "cloudflare" | "mistral" | "mistral_backup" | "nvidia" | "cohere" | "llm7" | "llm7_fast"

export interface ProviderConfig {
  id: ProviderId
  name: string
  envKey: string
  model: string
  enabled: boolean
  priority: number
  rateLimitPerSec: number
  timeoutMs: number
  costPer1kTokens: number
  taskTypes?: string[]
  // Discovered model information
  discoveredAt?: string
  verifiedAt?: string
  usable?: boolean
  latencyMs?: number
  capabilities?: {
    maxTokens?: number
    supportsJSON?: boolean
    supportsSystemPrompt?: boolean
    chat?: boolean
    // Live-measured (model-sync JSON probe): can this model emit parseable
    // JSON that follows the requested schema? Verified by one real inference
    // call per candidate; persisted in ai_model_registry.capabilities.
    structuredJSON?: boolean
  }
}

/**
 * KNOWN model-level JSON capability — measured truth, not assumption.
 *
 * Sources:
 *  - Production measurement (2026-08-11, ai_provider_log + job_ai_intelligence):
 *    @cf/google/gemma-2b-it-lora returned 40 HTTP-200 responses of which 37
 *    were unparseable for the structured intelligence schema (92.5%).
 *  - Official docs (developers.cloudflare.com/workers-ai/models/gemma-2b-it-lora):
 *    it is a Beta 2B model dedicated to LoRA adapters — not a strict
 *    instruction/schema-following model. Compare llama-3.3-70b-instruct-fp8-fast,
 *    which the official docs list with function-calling support.
 *
 * Models absent from this map default to "assume JSON-capable" and are
 * corroborated (or contradicted) by the live model-sync JSON probe
 * (capabilities.structuredJSON). This map exists so the router and the
 * dynamic registry behave correctly even before the next discovery cycle.
 */
export const MODEL_JSON_CAPABILITY: Record<string, boolean> = {
  '@cf/google/gemma-2b-it-lora': false,
}

/** Effective JSON capability for a provider's selected model. */
export function modelIsJsonCapable(model: string | undefined, capabilities?: ProviderConfig['capabilities']): boolean {
  if (!model) return true
  if (MODEL_JSON_CAPABILITY[model] === false) return false
  if (capabilities?.structuredJSON === false) return false
  return true
}

export const PROVIDERS: ProviderConfig[] = [
  // Gemini: free tier = Flash/Flash-Lite only (Pro removed Apr 2026). The old
  // gemini-2.5-flash ID is retired (404 "no longer available" in provider log;
  // official shutdown Oct 16, 2026). gemini-3.5-flash is GA with official
  // structured output (responseSchema + application/json) — verified available
  // on both keys via discovery (2026-08-11). Each model has its own free-tier
  // quota bucket (~1.5k RPD), so primary + backup don't share one cap.
  // CV transformation routes here via agentId "cv:parsing" (cv_parsing task) —
  // this config is what keeps Gemini in the CV-uplift rotation alongside Cerebras.
  { id: "gemini", name: "Gemini 3.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-3.5-flash", enabled: true, priority: 1, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1, taskTypes: ["cv_parsing", "profile_transform", "complex_analysis"] },
  { id: "gemini_backup", name: "Gemini 3.5 Flash Lite", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-3.5-flash-lite", enabled: true, priority: 2, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1, taskTypes: ["cv_parsing", "profile_transform", "complex_analysis"] },
  // Groq: proven working. On-demand: 100K TPD, ~30 RPM.
  { id: "groq", name: "Groq Llama 3.3", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", enabled: true, priority: 3, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2, taskTypes: ["job_intelligence", "fast_extraction", "simple_analysis"] },
  // Cerebras: verified working. GET /v1/models confirmed gpt-oss-120b.
  { id: "cerebras", name: "Cerebras GPT-OSS 120B", envKey: "CEREBRAS_API_KEY", model: "gpt-oss-120b", enabled: true, priority: 4, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2, taskTypes: ["job_intelligence", "fast_extraction", "bulk_processing"] },
  // OpenRouter: free-tier key, routes through deepinfra.
  { id: "openrouter", name: "OpenRouter Llama 4", envKey: "OPENROUTER_API_KEY", model: "meta-llama/llama-4-maverick", enabled: true, priority: 5, rateLimitPerSec: 3, timeoutMs: 30000, costPer1kTokens: 0, taskTypes: ["job_intelligence", "fallback"] },
  // HuggingFace: re-enabled — was disabled due to Vercel fetch issues, now retried with timeout
  { id: "huggingface", name: "HuggingFace", envKey: "HUGGINGFACE_API_KEY", model: "meta-llama/Llama-3.1-8B-Instruct", enabled: true, priority: 6, rateLimitPerSec: 2, timeoutMs: 30000, costPer1kTokens: 1, taskTypes: ["simple_analysis"] },
  // GitHub Models: GitHub's AI model marketplace
  { id: "github_models", name: "GitHub Models", envKey: "GITHUB_MODELS_TOKEN", model: "gpt-4o-mini", enabled: true, priority: 7, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 0, taskTypes: ["job_intelligence", "code_analysis"] },
  // Cloudflare Workers AI: Edge-deployed AI
  { id: "cloudflare", name: "Cloudflare Workers AI", envKey: "CLOUDFLARE_API_TOKEN", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", enabled: true, priority: 8, rateLimitPerSec: 10, timeoutMs: 10000, costPer1kTokens: 0, taskTypes: ["fast_extraction", "edge_processing"] },
  // Mistral: European AI provider
  { id: "mistral", name: "Mistral Large", envKey: "MISTRAL_API_KEY", model: "mistral-large-latest", enabled: true, priority: 9, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 3, taskTypes: ["complex_analysis", "european_jobs"] },
  // Mistral Backup: second Mistral key (separate quota bucket) so the
  // provider survives primary-key exhaustion. Same OpenAI-compatible API.
  { id: "mistral_backup", name: "Mistral Large (backup key)", envKey: "MISTRAL_API_KEY_BACKUP", model: "mistral-large-latest", enabled: true, priority: 10, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 3, taskTypes: ["complex_analysis", "european_jobs", "fallback"] },
  // NVIDIA NIM: NVIDIA's inference microservice
  { id: "nvidia", name: "NVIDIA NIM", envKey: "NVIDIA_API_KEY", model: "meta/llama-3.1-70b-instruct", enabled: true, priority: 11, rateLimitPerSec: 5, timeoutMs: 30000, costPer1kTokens: 2, taskTypes: ["job_intelligence", "gpu_accelerated"] },
  // Cohere: Command A (v2 Chat API, structured JSON via response_format).
  // Wired 2026-08-13: COHERE_API_KEY was configured in Vercel but no cohere
  // provider existed — dead weight. Now a first-class provider with its own
  // gateway branch (api.cohere.com/v2/chat) + discovery (/v1/models).
  // LIVE-VERIFIED 2026-08-13 09:11 UTC: command-a-03-2025 usable=true,
  // healthScore=100, 239ms avg; command-a-plus-05-2026 returned failures on
  // this key (verified=false) — so the default model is the measured one.
  { id: "cohere", name: "Cohere Command A", envKey: "COHERE_API_KEY", model: "command-a-03-2025", enabled: true, priority: 12, rateLimitPerSec: 2, timeoutMs: 30000, costPer1kTokens: 4, taskTypes: ["job_intelligence", "simple_analysis", "fallback"] },
  // [PHASE-4] LLM7 (api.llm7.io) — OpenAI-compatible unified gateway behind
  // OpenAI/Mistral/Azure/Cloudflare/DeepSeek/etc. Model IDs are NOT hardcoded:
  // "default"/"fast" are the documented routing selectors; model discovery
  // (/v1/models) + model-sync live probes measure concrete models and the
  // dynamic registry swaps in the best MEASURED one. Free tier: JSON via
  // prompt only (response_format is a paid feature) — the gateway never sends
  // response_format for any provider, and probes for llm7 use plain prompts.
  // Free limits (~20 req/min, 100 req/hour) are enforced by the Smart Router's
  // 429/quota backoff, not by trusting declared rates.
  { id: "llm7", name: "LLM7 Gateway (default routing)", envKey: "LLM7_API_KEY", model: "default", enabled: true, priority: 13, rateLimitPerSec: 1, timeoutMs: 30000, costPer1kTokens: 0, taskTypes: ["job_intelligence", "fast_extraction", "fallback"] },
  { id: "llm7_fast", name: "LLM7 Gateway (fast routing)", envKey: "LLM7_API_KEY", model: "fast", enabled: true, priority: 14, rateLimitPerSec: 1, timeoutMs: 20000, costPer1kTokens: 0, taskTypes: ["fast_extraction", "simple_analysis", "fallback"] },
]

export interface ProviderHealth {
  id: ProviderId; isHealthy: boolean; lastSuccessAt: string | null; lastFailedAt: string | null
  consecutiveFailures: number; totalRequests: number; failedRequests: number
  failureRate: number; avgLatencyMs: number | null; lastError?: string; enabled: boolean
}
