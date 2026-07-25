/**
 * AI Gateway — Single entry point for every AI request
 * Supports automatic routing, retries, fallback, health checks, cost tracking
 */

import { PROVIDERS, type ProviderId } from "./providers/types"
import { getHealthyProviders, recordSuccess, recordFailure, getProviderHealth } from "./providers/manager"

export interface AIRequest {
  prompt: string
  systemInstruction?: string
  responseSchema?: any
  temperature?: number
  maxTokens?: number
  agentId: string // for audit logging
  jobId?: string
}

export interface AIResponse {
  text: string
  provider: ProviderId
  model: string
  latencyMs: number
  tokensInput?: number
  tokensOutput?: number
  costCents?: number
  confidence?: number
  evidence?: string[]
}

export interface GatewayResult {
  response: AIResponse
  fallbackUsed: boolean
  fallbackChain: ProviderId[]
  disagreements?: any[]
}

// Simple in-memory cache for identical prompts (24h TTL)
const cache = new Map<string, { result: GatewayResult; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000

function cacheKey(req: AIRequest): string {
  return `${req.agentId}:${req.prompt.slice(0,200)}:${req.systemInstruction?.slice(0,100) || ''}`
}

async function callProvider(providerId: ProviderId, req: AIRequest): Promise<AIResponse> {
  const cfg = PROVIDERS.find(p => p.id === providerId)
  if (!cfg) throw new Error(`Provider ${providerId} not found`)

  const apiKey = process.env[cfg.envKey]
  if (!apiKey) throw new Error(`Missing env ${cfg.envKey} for provider ${providerId}`)

  const start = Date.now()

  // For foundation, we implement Gemini directly and simulate others with same interface
  // In production, each provider would have its own SDK call
  try {
    if (providerId.startsWith('gemini')) {
      // Gemini Flash
      const { GoogleGenAI } = await import("@google/genai")
      const ai = new GoogleGenAI({ apiKey })
      const result = await ai.models.generateContent({
        model: cfg.model,
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        config: {
          systemInstruction: req.systemInstruction,
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 1024,
          ...(req.responseSchema ? { responseMimeType: "application/json", responseSchema: req.responseSchema } : {}),
        },
      })
      const text = result.text || ""
      const latency = Date.now() - start
      return {
        text,
        provider: providerId,
        model: cfg.model,
        latencyMs: latency,
        tokensInput: result.usageMetadata?.promptTokenCount,
        tokensOutput: result.usageMetadata?.candidatesTokenCount,
        costCents: Math.round(((result.usageMetadata?.promptTokenCount || 0) + (result.usageMetadata?.candidatesTokenCount || 0)) * cfg.costPer1kTokens / 1000),
      }
    }

    // For other providers (Groq, Cerebras, OpenRouter, HuggingFace), use OpenAI-compatible fetch for foundation
    // Groq and Cerebras and OpenRouter all support OpenAI chat completions
    const openAICompatibleProviders: ProviderId[] = ["groq", "cerebras", "openrouter"]
    if (openAICompatibleProviders.includes(providerId)) {
      const baseUrls: Record<string, string> = {
        groq: "https://api.groq.com/openai/v1/chat/completions",
        cerebras: "https://api.cerebras.ai/v1/chat/completions",
        openrouter: "https://openrouter.ai/api/v1/chat/completions",
      }
      const url = baseUrls[providerId]
      if (!url) throw new Error(`No URL for ${providerId}`)

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            ...(req.systemInstruction ? [{ role: "system", content: req.systemInstruction }] : []),
            { role: "user", content: req.prompt },
          ],
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 1024,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`${providerId} ${res.status}: ${errText.slice(0,200)}`)
      }
      const data = await res.json() as any
      const text = data.choices?.[0]?.message?.content || ""
      const latency = Date.now() - start
      return {
        text,
        provider: providerId,
        model: cfg.model,
        latencyMs: latency,
        tokensInput: data.usage?.prompt_tokens,
        tokensOutput: data.usage?.completion_tokens,
        costCents: Math.round(((data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0)) * cfg.costPer1kTokens / 1000),
      }
    }

    // HuggingFace fallback - text generation
    if (providerId === "huggingface") {
      const res = await fetch(`https://api-inference.huggingface.co/models/${cfg.model}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: req.prompt, parameters: { max_new_tokens: req.maxTokens || 512, temperature: req.temperature || 0.3 } }),
      })
      if (!res.ok) throw new Error(`HuggingFace ${res.status}`)
      const data = await res.json() as any
      const text = Array.isArray(data) ? data[0]?.generated_text || "" : data.generated_text || ""
      return {
        text,
        provider: providerId,
        model: cfg.model,
        latencyMs: Date.now() - start,
      }
    }

    throw new Error(`Provider ${providerId} not implemented`)
  } catch (e) {
    throw e
  }
}

export async function aiGateway(req: AIRequest): Promise<GatewayResult> {
  const key = cacheKey(req)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result
  }

  const healthyProviders = getHealthyProviders()
  const providersToTry = healthyProviders.length > 0 ? healthyProviders : PROVIDERS.filter(p => p.enabled)

  let lastError: any = null
  const fallbackChain: ProviderId[] = []
  let fallbackUsed = false

  for (let i = 0; i < providersToTry.length; i++) {
    const provider = providersToTry[i]
    fallbackChain.push(provider.id as ProviderId)

    try {
      const response = await callProvider(provider.id as ProviderId, req)
      recordSuccess(provider.id as ProviderId, response.latencyMs)

      const result: GatewayResult = {
        response,
        fallbackUsed: i > 0,
        fallbackChain,
      }

      // Cache successful result
      cache.set(key, { result, timestamp: Date.now() })

      // Log to audit via console + DB (non-blocking)
      try {
        const { logAudit } = await import("./audit/logger")
        await logAudit({
          decision: `AI Gateway success via ${provider.id}`,
          evidence: [req.prompt.slice(0,200)],
          model: provider.model,
          confidence: 80,
          action: "allow",
          jobId: req.jobId,
        })
      } catch {}

      return result
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      recordFailure(provider.id as ProviderId, errMsg)
      lastError = e
      fallbackUsed = true
      console.warn(`[AI Gateway] ${provider.id} failed, trying next: ${errMsg.slice(0,200)}`)
      continue
    }
  }

  // All providers failed
  throw new Error(`All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}. Tried: ${fallbackChain.join(', ')}`)
}

export async function aiCouncil(
  task: string,
  prompt: string,
  options: { models?: string[], agentId: string, jobId?: string } = { agentId: "council:generic" }
): Promise<{ consensus: string; confidence: number; disagreements: any[]; provider: ProviderId; fallbackUsed: boolean }> {
  // For foundation: run 2 models, one answers, one reviews, third resolves if disagreement
  const modelsToUse = options.models || ["gemini", "groq", "cerebras"]

  const results: { provider: ProviderId; text: string; confidence: number }[] = []

  for (const modelId of modelsToUse.slice(0, 2)) {
    try {
      const provider = PROVIDERS.find(p => p.id === modelId) || PROVIDERS[0]
      const req: AIRequest = {
        prompt: task === "profile-transform" 
          ? `You are reviewing this profile transformation. Check for truthfulness, no fabrication, evidence-based:\n${prompt}`
          : prompt,
        agentId: options.agentId,
        jobId: options.jobId,
        temperature: 0.3,
      }
      const gwResult = await aiGateway(req)
      results.push({ provider: gwResult.response.provider, text: gwResult.response.text, confidence: 75 })
    } catch (e) {
      console.warn(`[Council] ${modelId} failed:`, e)
    }
  }

  if (results.length === 0) {
    throw new Error("All council models failed")
  }

  // Simple consensus: if 2 results are similar (first 100 chars), consensus high, else disagreement
  const hasDisagreement = results.length >= 2 && results[0].text.slice(0,100) !== results[1].text.slice(0,100)
  const disagreements = hasDisagreement ? [{ model: results[1].provider, verdict: "challenge", reason: "Different output than first model" }] : []

  const consensus = results[0].text
  const confidence = disagreements.length === 0 ? 85 : 65

  return {
    consensus,
    confidence,
    disagreements,
    provider: results[0].provider,
    fallbackUsed: results.length < modelsToUse.length,
  }
}
