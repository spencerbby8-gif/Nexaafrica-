export type ProviderId = "cerebras" | "gemini" | "gemini_backup" | "groq" | "openrouter" | "huggingface"

export interface ProviderConfig {
  id: ProviderId
  name: string
  envKey: string
  model: string
  enabled: boolean
  priority: number // lower = higher priority
  rateLimitPerSec: number
  timeoutMs: number
  costPer1kTokens: number // cents
}

export const PROVIDERS: ProviderConfig[] = [
  { id: "gemini", name: "Gemini 2.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-2.5-flash", enabled: true, priority: 1, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  { id: "gemini_backup", name: "Gemini Backup", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-2.5-flash", enabled: true, priority: 2, rateLimitPerSec: 2, timeoutMs: 15000, costPer1kTokens: 1 },
  { id: "groq", name: "Groq Llama 3.3", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", enabled: true, priority: 3, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  { id: "cerebras", name: "Cerebras Llama", envKey: "CEREBRAS_API_KEY", model: "llama-3.3-70b", enabled: true, priority: 4, rateLimitPerSec: 5, timeoutMs: 10000, costPer1kTokens: 2 },
  { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY", model: "google/gemini-2.0-flash-001", enabled: true, priority: 5, rateLimitPerSec: 3, timeoutMs: 15000, costPer1kTokens: 3 },
  { id: "huggingface", name: "HuggingFace", envKey: "HUGGINGFACE_API_KEY", model: "HuggingFaceH4/zephyr-7b-beta", enabled: true, priority: 6, rateLimitPerSec: 2, timeoutMs: 20000, costPer1kTokens: 1 },
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
