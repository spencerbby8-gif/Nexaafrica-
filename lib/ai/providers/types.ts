export type ProviderId = "cerebras" | "gemini" | "gemini_backup" | "groq" | "openrouter" | "huggingface"

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
}

export const PROVIDERS: ProviderConfig[] = [
  // Gemini: free-tier quota — 429 RESOURCE_EXHAUSTED when >20 RPM.
  { id: "gemini", name: "Gemini 2.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-2.5-flash", enabled: true, priority: 1, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  // Gemini Backup disabled: shares same key/quota as primary — no redundancy value.
  { id: "gemini_backup", name: "Gemini Backup", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-2.5-flash", enabled: false, priority: 2, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  // Groq: proven working in production. Only provider that reliably succeeds.
  { id: "groq", name: "Groq Llama 3.3", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", enabled: true, priority: 3, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  // Cerebras model fixed: old "llama-3.3-70b" returned 404. Cerebras uses "llama3.1-70b".
  { id: "cerebras", name: "Cerebras Llama", envKey: "CEREBRAS_API_KEY", model: "llama3.1-70b", enabled: true, priority: 4, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  // OpenRouter model fixed: "google/gemini-2.0-flash-001" returned 404.
  { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY", model: "google/gemini-2.5-flash", enabled: true, priority: 5, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 3 },
  // HuggingFace disabled: "fetch failed" in Vercel serverless.
  { id: "huggingface", name: "HuggingFace", envKey: "HUGGINGFACE_API_KEY", model: "HuggingFaceH4/zephyr-7b-beta", enabled: false, priority: 6, rateLimitPerSec: 2, timeoutMs: 20000, costPer1kTokens: 1 },
]

export interface ProviderHealth {
  id: ProviderId
  isHealthy: boolean
  lastSuccessAt: string | null
  lastFailedAt: string | null
  consecutiveFailures: number
  totalRequests: number
  failedRequests: number
  failureRate: number
  avgLatencyMs: number | null
  lastError?: string
  enabled: boolean
}
