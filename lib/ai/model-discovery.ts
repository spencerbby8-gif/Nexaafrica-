/**
 * AI Model Discovery & Verification System
 * 
 * Discovers available models from each provider's catalog/API,
 * verifies them with real inference requests, and caches results.
 */

import { createClient } from '@supabase/supabase-js'

export interface DiscoveredModel {
  provider: string
  modelId: string
  modelName: string
  verified: boolean
  usable: boolean
  latencyMs?: number
  error?: string
  verifiedAt: string
  capabilities?: {
    maxTokens?: number
    supportsJSON?: boolean
    supportsSystemPrompt?: boolean
  }
}

export interface ProviderCatalog {
  provider: string
  models: DiscoveredModel[]
  lastRefreshed: string
  totalModels: number
  verifiedModels: number
  usableModels: number
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Discover models from Gemini API
 */
async function discoverGeminiModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey }
    })
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.models || []
    
    for (const model of modelList) {
      const modelId = model.name.replace('models/', '')
      
      // Only include generation models
      if (!model.supportedGenerationMethods?.includes('generateContent')) {
        continue
      }
      
      models.push({
        provider: 'gemini',
        modelId,
        modelName: model.displayName || modelId,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: model.outputTokenLimit,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('Gemini discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from Groq API
 */
async function discoverGroqModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    for (const model of modelList) {
      models.push({
        provider: 'groq',
        modelId: model.id,
        modelName: model.id,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: 8192,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('Groq discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from Cerebras API
 */
async function discoverCerebrasModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://api.cerebras.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      throw new Error(`Cerebras API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.models || []
    
    for (const model of modelList) {
      models.push({
        provider: 'cerebras',
        modelId: model.id,
        modelName: model.id,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: 8192,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('Cerebras discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from OpenRouter API
 */
async function discoverOpenRouterModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    for (const model of modelList) {
      // Only include free models
      if (model.pricing?.prompt !== '0' || model.pricing?.completion !== '0') {
        continue
      }
      
      models.push({
        provider: 'openrouter',
        modelId: model.id,
        modelName: model.name || model.id,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: model.context_length || 8192,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('OpenRouter discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from GitHub Models API
 */
async function discoverGitHubModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://models.inference.ai.azure.com/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'api-version': '2024-05-01-preview'
      }
    })
    
    if (!response.ok) {
      throw new Error(`GitHub Models API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    for (const model of modelList) {
      models.push({
        provider: 'github_models',
        modelId: model.id,
        modelName: model.name || model.id,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: 4096,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('GitHub Models discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from Cloudflare Workers AI
 */
async function discoverCloudflareModels(apiToken: string, accountId: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
      {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      }
    )
    
    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.result || []
    
    for (const model of modelList) {
      // Only include text generation models
      if (!model.task?.name?.includes('Text Generation')) {
        continue
      }
      
      models.push({
        provider: 'cloudflare',
        modelId: model.name,
        modelName: model.name,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: 2048,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('Cloudflare discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from Mistral API
 */
async function discoverMistralModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    for (const model of modelList) {
      models.push({
        provider: 'mistral',
        modelId: model.id,
        modelName: model.id,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: 8192,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('Mistral discovery error:', error.message)
  }
  
  return models
}

/**
 * Discover models from NVIDIA NIM API
 */
async function discoverNvidiaModels(apiKey: string): Promise<DiscoveredModel[]> {
  const models: DiscoveredModel[] = []
  
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    
    if (!response.ok) {
      throw new Error(`NVIDIA API error: ${response.status}`)
    }
    
    const data = await response.json() as any
    const modelList = data.data || []
    
    for (const model of modelList) {
      models.push({
        provider: 'nvidia',
        modelId: model.id,
        modelName: model.id,
        verified: false,
        usable: false,
        verifiedAt: new Date().toISOString(),
        capabilities: {
          maxTokens: 4096,
          supportsJSON: true,
          supportsSystemPrompt: true
        }
      })
    }
  } catch (error: any) {
    console.error('NVIDIA discovery error:', error.message)
  }
  
  return models
}

/**
 * Verify a model with a real inference request
 */
async function verifyModel(model: DiscoveredModel, apiKey: string): Promise<DiscoveredModel> {
  const startTime = Date.now()
  
  try {
    let response: Response
    
    if (model.provider === 'gemini') {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "test"' }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        }
      )
    } else if (model.provider === 'cloudflare') {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model.modelId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Say "test"' }],
            max_tokens: 10
          })
        }
      )
    } else {
      // OpenAI-compatible APIs
      const endpoints: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        cerebras: 'https://api.cerebras.ai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        github_models: 'https://models.inference.ai.azure.com/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions'
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
      
      if (model.provider === 'github_models') {
        headers['api-version'] = '2024-05-01-preview'
      }
      
      if (model.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://nexaafrica.vercel.app'
        headers['X-Title'] = 'Nexa Africa'
      }
      
      response = await fetch(endpoints[model.provider], {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model.modelId,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 10
        })
      })
    }
    
    const latency = Date.now() - startTime
    
    if (response.ok) {
      return {
        ...model,
        verified: true,
        usable: true,
        latencyMs: latency,
        verifiedAt: new Date().toISOString()
      }
    } else {
      const errorText = await response.text()
      return {
        ...model,
        verified: true,
        usable: false,
        error: `${response.status}: ${errorText.substring(0, 200)}`,
        latencyMs: latency,
        verifiedAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    return {
      ...model,
      verified: true,
      usable: false,
      error: error.message,
      latencyMs: Date.now() - startTime,
      verifiedAt: new Date().toISOString()
    }
  }
}

/**
 * Discover and verify all models from all providers
 */
export async function discoverAllModels(): Promise<ProviderCatalog[]> {
  const catalogs: ProviderCatalog[] = []
  
  // Gemini Primary
  if (process.env.GEMINI_API_KEY) {
    const models = await discoverGeminiModels(process.env.GEMINI_API_KEY)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.GEMINI_API_KEY!))
    )
    catalogs.push({
      provider: 'gemini',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // Gemini Backup
  if (process.env.GEMINI_API_KEY_BACKUP) {
    const models = await discoverGeminiModels(process.env.GEMINI_API_KEY_BACKUP)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.GEMINI_API_KEY_BACKUP!))
    )
    catalogs.push({
      provider: 'gemini_backup',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // Groq
  if (process.env.GROQ_API_KEY) {
    const models = await discoverGroqModels(process.env.GROQ_API_KEY)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.GROQ_API_KEY!))
    )
    catalogs.push({
      provider: 'groq',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // Cerebras
  if (process.env.CEREBRAS_API_KEY) {
    const models = await discoverCerebrasModels(process.env.CEREBRAS_API_KEY)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.CEREBRAS_API_KEY!))
    )
    catalogs.push({
      provider: 'cerebras',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    const models = await discoverOpenRouterModels(process.env.OPENROUTER_API_KEY)
    const verified = await Promise.all(
      models.slice(0, 10).map(m => verifyModel(m, process.env.OPENROUTER_API_KEY!))
    )
    catalogs.push({
      provider: 'openrouter',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // GitHub Models
  if (process.env.GITHUB_MODELS_TOKEN) {
    const models = await discoverGitHubModels(process.env.GITHUB_MODELS_TOKEN)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.GITHUB_MODELS_TOKEN!))
    )
    catalogs.push({
      provider: 'github_models',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // Cloudflare
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    const models = await discoverCloudflareModels(
      process.env.CLOUDFLARE_API_TOKEN,
      process.env.CLOUDFLARE_ACCOUNT_ID
    )
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.CLOUDFLARE_API_TOKEN!))
    )
    catalogs.push({
      provider: 'cloudflare',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // Mistral
  if (process.env.MISTRAL_API_KEY) {
    const models = await discoverMistralModels(process.env.MISTRAL_API_KEY)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.MISTRAL_API_KEY!))
    )
    catalogs.push({
      provider: 'mistral',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // NVIDIA
  if (process.env.NVIDIA_API_KEY) {
    const models = await discoverNvidiaModels(process.env.NVIDIA_API_KEY)
    const verified = await Promise.all(
      models.slice(0, 5).map(m => verifyModel(m, process.env.NVIDIA_API_KEY!))
    )
    catalogs.push({
      provider: 'nvidia',
      models: verified,
      lastRefreshed: new Date().toISOString(),
      totalModels: models.length,
      verifiedModels: verified.length,
      usableModels: verified.filter(m => m.usable).length
    })
  }
  
  // Cache results
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    for (const catalog of catalogs) {
      await supabase
        .from('ai_model_catalog')
        .upsert({
          provider: catalog.provider,
          models: catalog.models,
          last_refreshed: catalog.lastRefreshed,
          total_models: catalog.totalModels,
          verified_models: catalog.verifiedModels,
          usable_models: catalog.usableModels
        }, { onConflict: 'provider' })
    }
  } catch (error: any) {
    console.error('Failed to cache model catalog:', error.message)
  }
  
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
      console.error('Failed to fetch model catalog:', error.message)
      return []
    }
    
    return (data || []).map((row: any) => ({
      provider: row.provider,
      models: row.models,
      lastRefreshed: row.last_refreshed,
      totalModels: row.total_models,
      verifiedModels: row.verified_models,
      usableModels: row.usable_models
    }))
  } catch (error: any) {
    console.error('Failed to fetch model catalog:', error.message)
    return []
  }
}
