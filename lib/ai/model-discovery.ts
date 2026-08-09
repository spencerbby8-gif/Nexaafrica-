/**
 * AI Model Discovery - Live Discovery from Provider APIs
 * 
 * CRITICAL: No hardcoded model lists. Every model must be discovered from
 * the provider's official API or catalog.
 */

import { createClient } from '@supabase/supabase-js'

export interface DiscoveredModel {
  provider: string
  modelId: string
  modelName: string
  discoveredAt: string
  discoveryEndpoint: string
  rawResponse: any
  // Capabilities will be detected via live tests, not hardcoded
  capabilities: {
    chat?: boolean
    reasoning?: boolean
    coding?: boolean
    vision?: boolean
    functionCalling?: boolean
    structuredJSON?: boolean
    embeddings?: boolean
    longContext?: boolean
    maxTokens?: number
    contextLength?: number
  }
  // Health metrics (updated via live verification)
  health: {
    verified: boolean
    usable: boolean
    healthScore: number  // 0-100
    successRate: number  // 0-100
    failureRate: number  // 0-100
    avgLatencyMs: number
    lastVerifiedAt?: string
    lastSuccessfulAt?: string
    quotaStatus: 'ok' | 'warning' | 'exhausted'
    cooldownUntil?: string
  }
  // Benchmark results
  benchmarks?: {
    jobIntelligence?: number  // 0-100
    trustVerification?: number
    africaEligibility?: number
    salaryExtraction?: number
    companyVerification?: number
    cvParsing?: number
    evidenceGeneration?: number
    structuredJSON?: number
    overallScore?: number
    lastBenchmarkAt?: string
  }
  // Routing
  routingPriority: number  // Calculated dynamically
  cost?: {
    inputPer1kTokens?: number
    outputPer1kTokens?: number
  }
}

export interface ProviderCatalog {
  provider: string
  discoveryEndpoint: string
  discoveredAt: string
  models: DiscoveredModel[]
  totalModels: number
  verifiedModels: number
  usableModels: number
  discoveryError?: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// [RELIABILITY] Gemini candidate hygiene. The raw /models listing returns every
// model family (image, TTS, Lyria music, robotics, agent research, computer
// use) plus legacy 2.x text models — some already shut down (2.0 line June
// 2026, gemini-2.5-flash pulled early for new users ~Jul 2026). model-sync
// verifies the configured model + the FIRST discovered candidates, so ordering
// decides what actually gets a live verification call. Only stable current
// text-generation models belong at the top of that pool.
const GEMINI_NON_TEXT_RE = /image|tts|lyria|robotics|nano-banana|antigravity|deep-research|computer-use|audio/i
const GEMINI_PREFERRED_ORDER = [
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
]

/**
 * Discover models from Gemini API
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models
 */
async function discoverGeminiModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[Gemini Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'x-goog-api-key': apiKey }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.models || []
    
    console.log(`[Gemini Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      const modelId = model.name.replace('models/', '')
      
      // Only include generation models
      if (!model.supportedGenerationMethods?.includes('generateContent')) {
        console.log(`[Gemini Discovery] Skipping ${modelId} (no generateContent)`)
        continue
      }
      // Only text chat models — non-text families would burn verification calls.
      if (GEMINI_NON_TEXT_RE.test(modelId)) {
        console.log(`[Gemini Discovery] Skipping ${modelId} (non-text family)`)
        continue
      }
      
      console.log(`[Gemini Discovery] Discovered ${modelId}`)
      
      models.push({
        provider: 'gemini',
        modelId,
        modelName: model.displayName || modelId,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {
          // Will be detected via live tests
          maxTokens: model.outputTokenLimit,
          contextLength: model.inputTokenLimit
        },
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0  // Will be calculated after benchmarks
      })
    }
  } catch (error: any) {
    console.error(`[Gemini Discovery] FAILED: ${error.message}`)
    throw error  // Do not fall back to hardcoded lists
  }

  // [RELIABILITY] Stable current models first (see GEMINI_PREFERRED_ORDER
  // above): model-sync's verification shortlist takes the configured model +
  // top discovered candidates, so this ordering is what actually gets tested.
  // Legacy 2.x models sink to the bottom — they get verified only if the
  // preferred pool is empty.
  models.sort((a, b) => {
    const ai = GEMINI_PREFERRED_ORDER.indexOf(a.modelId)
    const bi = GEMINI_PREFERRED_ORDER.indexOf(b.modelId)
    const ra = ai === -1 ? 99 : ai
    const rb = bi === -1 ? 99 : bi
    if (ra !== rb) return ra - rb
    return a.modelId < b.modelId ? -1 : 1
  })
  
  return models
}

/**
 * Discover models from Groq API
 * Endpoint: https://api.groq.com/openai/v1/models
 */
async function discoverGroqModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://api.groq.com/openai/v1/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[Groq Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Groq API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    console.log(`[Groq Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      console.log(`[Groq Discovery] Discovered ${model.id}`)
      
      models.push({
        provider: 'groq',
        modelId: model.id,
        modelName: model.id,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {
          // Will be detected via live tests
        },
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0
      })
    }
  } catch (error: any) {
    console.error(`[Groq Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover models from Cerebras API
 * Endpoint: https://api.cerebras.ai/v1/models
 */
async function discoverCerebrasModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://api.cerebras.ai/v1/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[Cerebras Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Cerebras API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.models || []
    
    console.log(`[Cerebras Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      console.log(`[Cerebras Discovery] Discovered ${model.id}`)
      
      models.push({
        provider: 'cerebras',
        modelId: model.id,
        modelName: model.id,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {},
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0
      })
    }
  } catch (error: any) {
    console.error(`[Cerebras Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover models from OpenRouter API
 * Endpoint: https://openrouter.ai/api/v1/models
 */
async function discoverOpenRouterModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://openrouter.ai/api/v1/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[OpenRouter Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    console.log(`[OpenRouter Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      // Only include free models
      if (model.pricing?.prompt !== '0' || model.pricing?.completion !== '0') {
        console.log(`[OpenRouter Discovery] Skipping ${model.id} (not free)`)
        continue
      }
      
      console.log(`[OpenRouter Discovery] Discovered ${model.id}`)
      
      models.push({
        provider: 'openrouter',
        modelId: model.id,
        modelName: model.name || model.id,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {
          contextLength: model.context_length
        },
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0,
        cost: {
          inputPer1kTokens: parseFloat(model.pricing?.prompt || '0'),
          outputPer1kTokens: parseFloat(model.pricing?.completion || '0')
        }
      })
    }
  } catch (error: any) {
    console.error(`[OpenRouter Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover models from GitHub Models API
 * Endpoint: https://models.inference.ai.azure.com/models
 */
async function discoverGitHubModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://models.inference.ai.azure.com/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[GitHub Models Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'api-version': '2024-05-01-preview'
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitHub Models API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    console.log(`[GitHub Models Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      console.log(`[GitHub Models Discovery] Discovered ${model.id}`)
      
      models.push({
        provider: 'github_models',
        modelId: model.id,
        modelName: model.name || model.id,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {},
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0
      })
    }
  } catch (error: any) {
    console.error(`[GitHub Models Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover models from Cloudflare Workers AI
 * Endpoint: https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/models/search
 */
async function discoverCloudflareModels(apiToken: string, accountId: string): Promise<DiscoveredModel[]> {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`
  const models: DiscoveredModel[] = []
  
  console.log(`[Cloudflare Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Cloudflare API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.result || []
    
    console.log(`[Cloudflare Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      // Only include text generation models
      if (!model.task?.name?.includes('Text Generation')) {
        console.log(`[Cloudflare Discovery] Skipping ${model.name} (not text generation)`)
        continue
      }
      
      console.log(`[Cloudflare Discovery] Discovered ${model.name}`)
      
      models.push({
        provider: 'cloudflare',
        modelId: model.name,
        modelName: model.name,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {},
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0
      })
    }
  } catch (error: any) {
    console.error(`[Cloudflare Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover models from Mistral API
 * Endpoint: https://api.mistral.ai/v1/models
 */
async function discoverMistralModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://api.mistral.ai/v1/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[Mistral Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Mistral API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    console.log(`[Mistral Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      console.log(`[Mistral Discovery] Discovered ${model.id}`)
      
      models.push({
        provider: 'mistral',
        modelId: model.id,
        modelName: model.id,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {},
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0
      })
    }
  } catch (error: any) {
    console.error(`[Mistral Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover models from NVIDIA NIM API
 * Endpoint: https://integrate.api.nvidia.com/v1/models
 */
async function discoverNvidiaModels(apiKey: string): Promise<DiscoveredModel[]> {
  const endpoint = 'https://integrate.api.nvidia.com/v1/models'
  const models: DiscoveredModel[] = []
  
  console.log(`[NVIDIA Discovery] Querying ${endpoint}`)
  
  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`NVIDIA API error ${response.status}: ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    console.log(`[NVIDIA Discovery] Found ${modelList.length} models`)
    
    for (const model of modelList) {
      console.log(`[NVIDIA Discovery] Discovered ${model.id}`)
      
      models.push({
        provider: 'nvidia',
        modelId: model.id,
        modelName: model.id,
        discoveredAt: new Date().toISOString(),
        discoveryEndpoint: endpoint,
        rawResponse: model,
        capabilities: {},
        health: {
          verified: false,
          usable: false,
          healthScore: 0,
          successRate: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          quotaStatus: 'ok'
        },
        routingPriority: 0
      })
    }
  } catch (error: any) {
    console.error(`[NVIDIA Discovery] FAILED: ${error.message}`)
    throw error
  }
  
  return models
}

/**
 * Discover all models from all providers
 * CRITICAL: If discovery fails for a provider, that provider is NOT used.
 * No fallback to hardcoded lists.
 */

/**
 * Discover models from Hugging Face Inference Providers router
 * Endpoint: https://router.huggingface.co/v1/models
 * (The legacy api-inference.huggingface.co endpoint returns 410 Gone -
 * verified in production: 0/8 queue attempts succeeded there.)
 */
async function discoverHuggingFaceModels(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch('https://router.huggingface.co/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000)
  })
  if (!res.ok) {
    throw new Error(`HF router ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data: any = await res.json()
  const ids: string[] = (data.data || []).map((m: any) => m.id).filter(Boolean)
  return ids.slice(0, 100).map((id) => ({
    provider: 'huggingface',
    modelId: id,
    modelName: id,
    discoveredAt: new Date().toISOString(),
    discoveryEndpoint: 'https://router.huggingface.co/v1/models',
    rawResponse: null,
    capabilities: { chat: true },
    health: {
      verified: false, usable: false, healthScore: 10,
      successRate: 0, failureRate: 0, avgLatencyMs: 0,
      quotaStatus: 'ok' as const
    },
    routingPriority: 30
  }))
}

export async function discoverAllModels(): Promise<ProviderCatalog[]> {
  const catalogs: ProviderCatalog[] = []
  
  console.log('=== LIVE MODEL DISCOVERY ===\n')
  
  // Gemini Primary
  if (process.env.GEMINI_API_KEY) {
    try {
      const models = await discoverGeminiModels(process.env.GEMINI_API_KEY)
      catalogs.push({
        provider: 'gemini',
        discoveryEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] Gemini discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'gemini',
        discoveryEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // Gemini Backup
  if (process.env.GEMINI_API_KEY_BACKUP) {
    try {
      const models = await discoverGeminiModels(process.env.GEMINI_API_KEY_BACKUP)
      catalogs.push({
        provider: 'gemini_backup',
        discoveryEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] Gemini Backup discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'gemini_backup',
        discoveryEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const models = await discoverGroqModels(process.env.GROQ_API_KEY)
      catalogs.push({
        provider: 'groq',
        discoveryEndpoint: 'https://api.groq.com/openai/v1/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] Groq discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'groq',
        discoveryEndpoint: 'https://api.groq.com/openai/v1/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // Cerebras
  if (process.env.CEREBRAS_API_KEY) {
    try {
      const models = await discoverCerebrasModels(process.env.CEREBRAS_API_KEY)
      catalogs.push({
        provider: 'cerebras',
        discoveryEndpoint: 'https://api.cerebras.ai/v1/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] Cerebras discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'cerebras',
        discoveryEndpoint: 'https://api.cerebras.ai/v1/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const models = await discoverOpenRouterModels(process.env.OPENROUTER_API_KEY)
      catalogs.push({
        provider: 'openrouter',
        discoveryEndpoint: 'https://openrouter.ai/api/v1/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] OpenRouter discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'openrouter',
        discoveryEndpoint: 'https://openrouter.ai/api/v1/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // GitHub Models
  if (process.env.GITHUB_MODELS_TOKEN) {
    try {
      const models = await discoverGitHubModels(process.env.GITHUB_MODELS_TOKEN)
      catalogs.push({
        provider: 'github_models',
        discoveryEndpoint: 'https://models.inference.ai.azure.com/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] GitHub Models discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'github_models',
        discoveryEndpoint: 'https://models.inference.ai.azure.com/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // Cloudflare
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    try {
      const models = await discoverCloudflareModels(
        process.env.CLOUDFLARE_API_TOKEN,
        process.env.CLOUDFLARE_ACCOUNT_ID
      )
      catalogs.push({
        provider: 'cloudflare',
        discoveryEndpoint: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search`,
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] Cloudflare discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'cloudflare',
        discoveryEndpoint: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search`,
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // Mistral
  if (process.env.MISTRAL_API_KEY) {
    try {
      const models = await discoverMistralModels(process.env.MISTRAL_API_KEY)
      catalogs.push({
        provider: 'mistral',
        discoveryEndpoint: 'https://api.mistral.ai/v1/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] Mistral discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'mistral',
        discoveryEndpoint: 'https://api.mistral.ai/v1/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  
  // NVIDIA
  if (process.env.NVIDIA_API_KEY) {
    try {
      const models = await discoverNvidiaModels(process.env.NVIDIA_API_KEY)
      catalogs.push({
        provider: 'nvidia',
        discoveryEndpoint: 'https://integrate.api.nvidia.com/v1/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] NVIDIA discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'nvidia',
        discoveryEndpoint: 'https://integrate.api.nvidia.com/v1/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }
  

  // HuggingFace (router endpoint; legacy api-inference is dead)
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      const models = await discoverHuggingFaceModels(process.env.HUGGINGFACE_API_KEY)
      catalogs.push({
        provider: 'huggingface',
        discoveryEndpoint: 'https://router.huggingface.co/v1/models',
        discoveredAt: new Date().toISOString(),
        models,
        totalModels: models.length,
        verifiedModels: 0,
        usableModels: 0
      })
    } catch (error: any) {
      console.error(`[Discovery] HuggingFace discovery failed: ${error.message}`)
      catalogs.push({
        provider: 'huggingface',
        discoveryEndpoint: 'https://router.huggingface.co/v1/models',
        discoveredAt: new Date().toISOString(),
        models: [],
        totalModels: 0,
        verifiedModels: 0,
        usableModels: 0,
        discoveryError: error.message
      })
    }
  }

  // Cache results
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    for (const catalog of catalogs) {
      await supabase
        .from('ai_model_catalog')
        .upsert({
          provider: catalog.provider,
          discovery_endpoint: catalog.discoveryEndpoint,
          models: catalog.models,
          last_refreshed: catalog.discoveredAt,
          total_models: catalog.totalModels,
          verified_models: catalog.verifiedModels,
          usable_models: catalog.usableModels,
          discovery_error: catalog.discoveryError
        }, { onConflict: 'provider' })
    }
  } catch (error: any) {
    console.error('[Discovery] Failed to cache model catalog:', error.message)
  }
  
  console.log(`\n=== DISCOVERY COMPLETE ===`)
  console.log(`Total providers: ${catalogs.length}`)
  console.log(`Total models: ${catalogs.reduce((sum, c) => sum + c.totalModels, 0)}`)
  console.log(`Providers with errors: ${catalogs.filter(c => c.discoveryError).length}`)
  
  return catalogs
}

/**
 * Get cached model catalog
 */
export async function getModelCatalog(provider?: string): Promise<ProviderCatalog[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    let query = supabase.from('ai_model_catalog').select('*')
    
    if (provider) {
      query = query.eq('provider', provider)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('[Discovery] Failed to fetch model catalog:', error.message)
      return []
    }
    
    return (data || []).map((row: any) => ({
      provider: row.provider,
      discoveryEndpoint: row.discovery_endpoint,
      discoveredAt: row.last_refreshed,
      models: row.models,
      totalModels: row.total_models,
      verifiedModels: row.verified_models,
      usableModels: row.usable_models,
      discoveryError: row.discovery_error
    }))
  } catch (error: any) {
    console.error('[Discovery] Failed to fetch model catalog:', error.message)
    return []
  }
}
