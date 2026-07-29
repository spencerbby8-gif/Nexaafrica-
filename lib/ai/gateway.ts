/**
 * AI Gateway — Single entry point for every AI request
 * Supports automatic routing, retries, fallback, health checks, cost tracking
 */

import { getProviders, getProvider, refreshProviderRegistry } from './providers/dynamic-registry'
import type { ProviderId } from './providers/types'
import { createHash } from "crypto"

export interface AIRequest {
  prompt: string
  systemInstruction?: string
  responseSchema?: any
  temperature?: number
  maxTokens?: number
  agentId: string
  jobId?: string
}

export interface AIResponse {
  text: string; provider: ProviderId; model: string; latencyMs: number
  tokensInput?: number; tokensOutput?: number; costCents?: number
}

export interface ProviderCallDiag {
  provider: string; model: string; event: 'attempt' | 'success' | 'failure'
  httpStatus?: number; errorCode?: string; errorMessage?: string; errorBody?: string
  retryCount: number; durationMs?: number; promptLen?: number; responseLen?: number
}

export interface GatewayResult {
  response: AIResponse; fallbackUsed: boolean; fallbackChain: ProviderId[]
  disagreements?: any[]; diag: ProviderCallDiag[]
}

const cache = new Map<string, { result: GatewayResult; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000

function cacheKey(req: AIRequest): string {
  // [FIX #5] Use SHA-256 hash of full prompt + system instruction to prevent
  // collisions between different jobs with similar prompt prefixes.
  const raw = `${req.agentId}:${req.jobId || ''}:${req.prompt}:${req.systemInstruction || ''}`
  return createHash("sha256").update(raw).digest("hex").slice(0, 32)
}

function gwLog(jobId: string | undefined, agentId: string, event: string, data: Record<string, unknown>) {
  try { console.log(JSON.stringify({ scope:"ai_gateway", ts:Date.now(), jobId:jobId||'-', agentId, event, ...data })); } catch {}
}

export async function callProvider(providerId: ProviderId, req: AIRequest, retryCount: number, diag: ProviderCallDiag[]): Promise<AIResponse> {
  const cfg = getProvider(providerId)
  if (!cfg) throw new Error(`Provider ${providerId} not found`)
  if (!cfg.enabled) throw new Error(`Provider ${providerId} is disabled`)
  const apiKey = process.env[cfg.envKey]
  if (!apiKey) throw new Error(`Missing env ${cfg.envKey} for provider ${providerId}`)
  const start = Date.now()
  const promptLen = req.prompt.length

  diag.push({ provider: providerId, model: cfg.model, event: "attempt", retryCount, promptLen })

  try {
    if (providerId.startsWith('gemini')) {
      const { GoogleGenAI } = await import("@google/genai")
      const ai = new GoogleGenAI({ apiKey })
      const geminiTimeoutMs = cfg.timeoutMs ?? 15000
      const result = await Promise.race([
        ai.models.generateContent({
        model: cfg.model,
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        config: {
          systemInstruction: req.systemInstruction, temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 1024,
          ...(req.responseSchema ? { responseMimeType:"application/json", responseSchema:req.responseSchema } : {}),
        },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`gemini timeout after ${geminiTimeoutMs}ms`)), geminiTimeoutMs)),
      ])
      const text = result.text || ""
      const latency = Date.now() - start
      diag.push({ provider: providerId, model: cfg.model, event: "success", retryCount, durationMs: latency, promptLen, responseLen: text.length })
      gwLog(req.jobId, req.agentId, "provider_success", { provider: providerId, latencyMs: latency, tokensIn: result.usageMetadata?.promptTokenCount, tokensOut: result.usageMetadata?.candidatesTokenCount })
      return { text, provider: providerId, model: cfg.model, latencyMs: latency, tokensInput: result.usageMetadata?.promptTokenCount, tokensOutput: result.usageMetadata?.candidatesTokenCount, costCents: Math.round(((result.usageMetadata?.promptTokenCount||0)+(result.usageMetadata?.candidatesTokenCount||0))*cfg.costPer1kTokens/1000) }
    }

    const openAICompat: ProviderId[] = ["groq","cerebras","openrouter","github_models","mistral","nvidia"]
    if (openAICompat.includes(providerId)) {
      const urls: Record<string,string> = {
        groq: "https://api.groq.com/openai/v1/chat/completions",
        cerebras: "https://api.cerebras.ai/v1/chat/completions",
        openrouter: "https://openrouter.ai/api/v1/chat/completions",
        github_models: "https://models.inference.ai.azure.com/chat/completions",
        mistral: "https://api.mistral.ai/v1/chat/completions",
        nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
      }
      const body: any = {
        model: cfg.model,
        messages: [...(req.systemInstruction?[{role:"system",content:req.systemInstruction}]:[]), {role:"user",content:req.prompt}],
        temperature: req.temperature??0.3, max_tokens: req.maxTokens??1024,
      }
      // OpenRouter: free-tier key routes through deepinfra.
      if (providerId === "openrouter") {
        body.provider = { order: ["deepinfra"], allow_fallbacks: false }
      }
      // GitHub Models requires api-version header
      const headers: any = { "Content-Type":"application/json", "Authorization":`Bearer ${apiKey}` }
      if (providerId === "github_models") {
        headers["api-version"] = "2024-05-01-preview"
      }
      const res = await fetch(urls[providerId], {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        // [RELIABILITY] timeoutMs from provider config was declared but never
        // applied — a hung provider could strand a queue worker indefinitely.
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 15000),
      })
      if (!res.ok) {
        const errText = await res.text()
        const latency = Date.now() - start
        let ec = `${res.status}`, em = errText.slice(0,500)
        try { const j=JSON.parse(errText); ec=j.error?.code||j.error?.type||ec; em=j.error?.message||em } catch {}
        diag.push({ provider: providerId, model: cfg.model, event: "failure", httpStatus: res.status, errorCode: ec, errorMessage: em, errorBody: errText.slice(0,1000), retryCount, durationMs: latency, promptLen })
        gwLog(req.jobId, req.agentId, "provider_error", { provider: providerId, status: res.status, errorCode: ec, errorMessage: em.slice(0,200) })
        throw new Error(`${providerId} ${res.status} (${ec}): ${em.slice(0,200)}`)
      }
      const data = await res.json() as any
      const text = data.choices?.[0]?.message?.content || ""
      const latency = Date.now() - start
      diag.push({ provider: providerId, model: cfg.model, event: "success", retryCount, durationMs: latency, promptLen, responseLen: text.length })
      gwLog(req.jobId, req.agentId, "provider_success", { provider: providerId, latencyMs: latency, tokensIn: data.usage?.prompt_tokens, tokensOut: data.usage?.completion_tokens })
      return { text, provider: providerId, model: cfg.model, latencyMs: latency, tokensInput: data.usage?.prompt_tokens, tokensOutput: data.usage?.completion_tokens, costCents: Math.round(((data.usage?.prompt_tokens||0)+(data.usage?.completion_tokens||0))*cfg.costPer1kTokens/1000) }
    }

    if (providerId === "cloudflare") {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
      if (!accountId) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID for Cloudflare provider")
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${cfg.model}`, {
        method: "POST",
        headers: { "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          messages: [...(req.systemInstruction?[{role:"system",content:req.systemInstruction}]:[]), {role:"user",content:req.prompt}],
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.3,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 15000),
      })
      if (!res.ok) {
        const errText = await res.text()
        const latency = Date.now() - start
        let ec = `${res.status}`, em = errText.slice(0,500)
        try { const j=JSON.parse(errText); ec=j.errors?.[0]?.code||ec; em=j.errors?.[0]?.message||em } catch {}
        diag.push({ provider: providerId, model: cfg.model, event: "failure", httpStatus: res.status, errorCode: ec, errorMessage: em, errorBody: errText.slice(0,1000), retryCount, durationMs: latency, promptLen })
        throw new Error(`Cloudflare ${res.status} (${ec}): ${em.slice(0,200)}`)
      }
      const data = await res.json() as any
      const text = data.result?.response || ""
      const latency = Date.now() - start
      diag.push({ provider: providerId, model: cfg.model, event: "success", retryCount, durationMs: latency, promptLen, responseLen: text.length })
      return { text, provider: providerId, model: cfg.model, latencyMs: latency }
    }

    if (providerId === "huggingface") {
      const res = await fetch(`https://api-inference.huggingface.co/models/${cfg.model}`, {
        method: "POST",
        headers: { "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({ inputs: req.prompt, parameters: { max_new_tokens: req.maxTokens||512, temperature: req.temperature||0.3 } }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 20000),
      })
      if (!res.ok) {
        const errText = await res.text()
        const latency = Date.now() - start
        let ec = `${res.status}`; try { const j=JSON.parse(errText); ec=j.error||ec } catch {}
        diag.push({ provider: providerId, model: cfg.model, event: "failure", httpStatus: res.status, errorCode: ec, errorMessage: errText.slice(0,500), errorBody: errText.slice(0,1000), retryCount, durationMs: latency, promptLen })
        throw new Error(`HuggingFace ${res.status}: ${errText.slice(0,200)}`)
      }
      const data = await res.json() as any
      const text = Array.isArray(data) ? data[0]?.generated_text || "" : data.generated_text || ""
      const latency = Date.now() - start
      diag.push({ provider: providerId, model: cfg.model, event: "success", retryCount, durationMs: latency, promptLen, responseLen: text.length })
      return { text, provider: providerId, model: cfg.model, latencyMs: latency }
    }
    throw new Error(`Provider ${providerId} not implemented`)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const alreadyLogged = /^\w+ \d{3} \(/.test(errMsg)
    if (!alreadyLogged) {
      const latency = Date.now() - start
      diag.push({ provider: providerId, model: cfg.model, event: "failure", errorCode: e instanceof Error ? (e as Error).name : "Unknown", errorMessage: errMsg.slice(0,500), retryCount, durationMs: latency, promptLen })
    }
    throw e
  }
}

export async function aiGateway(req: AIRequest): Promise<GatewayResult> {
  // Refresh provider registry if needed
  await refreshProviderRegistry()
  
  const providers = getProviders()
  const anyKeyConfigured = providers.some(p => process.env[p.envKey])
  if (!anyKeyConfigured) throw new Error("No AI provider API keys configured in environment")

  const key = cacheKey(req)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result

  // Delegate to health-aware orchestrator instead of sequential failover
  try {
    const { orchestrate } = await import("./orchestrator")
    const result = await orchestrate(req)
    cache.set(key, { result, timestamp: Date.now() })
    try {
      const { logAudit } = await import("./audit/logger")
      await logAudit({ decision: `AI Gateway success via ${result.response.provider}`, evidence:[req.prompt.slice(0,200)], model:result.response.model, confidence:80, action:"allow", jobId:req.jobId })
    } catch {}
    return result
  } catch (e: any) {
    if (e?.diag) {
      gwLog(req.jobId, req.agentId, "all_providers_unhealthy", { error: e.message?.slice(0,200) || "unknown" })
    }
    throw e
  }

}

export async function aiCouncil(
  task: string, prompt: string,
  options: { models?: string[], agentId: string, jobId?: string } = { agentId: "council:generic" }
): Promise<{ consensus: string; confidence: number; disagreements: any[]; provider: ProviderId; fallbackUsed: boolean }> {
  const modelsToUse = options.models || ["gemini","groq","cerebras"]
  const results: { provider: ProviderId; text: string; confidence: number }[] = []
  for (const modelId of modelsToUse.slice(0,2)) {
    try {
      const provider = getProvider(modelId as ProviderId)
      if (!provider) {
        console.warn(`[Council] Provider ${modelId} not found`)
        continue
      }
      const gwResult = await aiGateway({ prompt: task==="profile-transform"?`You are reviewing this profile transformation:\n${prompt}`:prompt, agentId:options.agentId, jobId:options.jobId, temperature:0.3 })
      results.push({ provider: gwResult.response.provider, text: gwResult.response.text, confidence:75 })
    } catch(e) { console.warn(`[Council] ${modelId} failed:`,e) }
  }
  if (results.length===0) throw new Error("All council models failed")
  const hasDisagreement = results.length>=2 && results[0].text.slice(0,100)!==results[1].text.slice(0,100)
  return { consensus:results[0].text, confidence:hasDisagreement?65:85, disagreements:hasDisagreement?[{model:results[1].provider, verdict:"challenge", reason:"Different output than first model"}]:[], provider:results[0].provider, fallbackUsed:results.length<modelsToUse.length }
}
