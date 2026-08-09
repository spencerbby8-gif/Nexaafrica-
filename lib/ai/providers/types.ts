export type ProviderId = "cerebras" | "gemini" | "gemini_backup" | "groq" | "openrouter" | "huggingface" | "github_models" | "cloudflare" | "mistral" | "nvidia"

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
  }
}

export const PROVIDERS: ProviderConfig[] = [
  // Gemini: gemini-2.5-flash is DEAD for new users since ~Jul 2026 (404
  // "no longer available to new users"; official deprecation 2026-10-16, pulled
  // early — verified live in ai_orch_health 2026-07-29). Free-tier replacements
  // per ai.google.dev: gemini-3.5-flash (GA 2026-05-19, free tier) primary,
  // gemini-3.1-flash-lite (GA 2026-05-07) backup — different model = separate
  // quota bucket. rateLimitPerSec now ENFORCED by gateway pacing: 0.25 rps ≈
  // 15 RPM, the free-tier ceiling for Flash-class models (1,500 RPD / 1M TPM).
  { id: "gemini", name: "Gemini 3.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-3.5-flash", enabled: true, priority: 1, rateLimitPerSec: 0.25, timeoutMs: 15000, costPer1kTokens: 1, taskTypes: ["cv_parsing", "profile_transform", "complex_analysis"] },
  { id: "gemini_backup", name: "Gemini 3.1 Flash Lite", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-3.1-flash-lite", enabled: true, priority: 2, rateLimitPerSec: 0.25, timeoutMs: 15000, costPer1kTokens: 1, taskTypes: ["cv_parsing", "profile_transform", "complex_analysis"] },
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
  // NVIDIA NIM: NVIDIA's inference microservice
  { id: "nvidia", name: "NVIDIA NIM", envKey: "NVIDIA_API_KEY", model: "meta/llama-3.1-70b-instruct", enabled: true, priority: 10, rateLimitPerSec: 5, timeoutMs: 30000, costPer1kTokens: 2, taskTypes: ["job_intelligence", "gpu_accelerated"] },
]

export interface ProviderHealth {
  id: ProviderId; isHealthy: boolean; lastSuccessAt: string | null; lastFailedAt: string | null
  consecutiveFailures: number; totalRequests: number; failedRequests: number
  failureRate: number; avgLatencyMs: number | null; lastError?: string; enabled: boolean
}
