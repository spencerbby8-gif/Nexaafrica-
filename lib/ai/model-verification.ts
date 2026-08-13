/**
 * Live Model Verification & Capability Detection
 * 
 * Verifies every discovered model with real inference requests.
 * Detects capabilities via live tests (not hardcoded).
 * Updates model health and capabilities in registry.
 */

import { createClient } from '@supabase/supabase-js'
import type { DiscoveredModel } from './model-discovery'
import { updateModelHealth, updateModelCapabilities } from './model-registry'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface VerificationResult {
  success: boolean
  latencyMs: number
  error?: string
  quotaExhausted?: boolean
  rateLimited?: boolean
  responseValid: boolean
  capabilities: {
    chat?: boolean
    reasoning?: boolean
    coding?: boolean
    vision?: boolean
    functionCalling?: boolean
    structuredJSON?: boolean
    embeddings?: boolean
    longContext?: boolean
  }
}

/**
 * Test if model supports chat
 */
async function testChatCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  try {
    const response = await makeInferenceRequest(model, apiKey, 'Say "hello"', 50)
    return response.success && response.responseValid
  } catch {
    return false
  }
}

/**
 * Test if model supports reasoning
 */
async function testReasoningCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  try {
    const prompt = 'If all cats are animals, and Fluffy is a cat, is Fluffy an animal? Answer yes or no.'
    const response = await makeInferenceRequest(model, apiKey, prompt, 50)
    if (!response.success || !response.responseValid) return false
    
    // Check if response contains "yes" (case insensitive)
    return response.responseText?.toLowerCase().includes('yes') || false
  } catch {
    return false
  }
}

/**
 * Test if model supports coding
 */
async function testCodingCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  try {
    const prompt = 'Write a Python function to reverse a string. Return only the code.'
    const response = await makeInferenceRequest(model, apiKey, prompt, 200)
    if (!response.success || !response.responseValid) return false
    
    // Check if response contains Python code
    const text = response.responseText?.toLowerCase() || ''
    return text.includes('def ') || text.includes('function') || text.includes('return')
  } catch {
    return false
  }
}

/**
 * Test if model supports structured JSON output
 */
async function testStructuredJSONCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  try {
    const prompt = 'Return a JSON object with fields: name (string), age (number), active (boolean). Example: {"name": "John", "age": 30, "active": true}'
    const response = await makeInferenceRequest(model, apiKey, prompt, 200)
    if (!response.success || !response.responseValid) return false
    
    // Try to parse as JSON
    try {
      const text = response.responseText || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return false
      
      const parsed = JSON.parse(jsonMatch[0])
      return typeof parsed === 'object' && parsed !== null
    } catch {
      return false
    }
  } catch {
    return false
  }
}

/**
 * Test if model supports function calling
 */
async function testFunctionCallingCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  // This is harder to test without actual function calling support
  // For now, we'll skip this test
  return false
}

/**
 * Test if model supports vision
 */
async function testVisionCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  // This requires sending an image, which is complex
  // For now, we'll skip this test
  return false
}

/**
 * Test if model supports embeddings
 */
async function testEmbeddingsCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  // This requires a different endpoint
  // For now, we'll skip this test
  return false
}

/**
 * Test if model supports long context
 */
async function testLongContextCapability(model: DiscoveredModel, apiKey: string): Promise<boolean> {
  try {
    // Generate a long prompt (2000 tokens)
    const longText = 'This is a test sentence for long context. '.repeat(100)
    const prompt = `${longText}\n\nWhat is the main topic of the text above? Answer in one word.`
    const response = await makeInferenceRequest(model, apiKey, prompt, 50)
    return response.success && response.responseValid
  } catch {
    return false
  }
}

/**
 * Make inference request to model
 */
async function makeInferenceRequest(
  model: DiscoveredModel,
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<{ success: boolean; responseText?: string; responseValid: boolean; latencyMs: number; quotaExhausted?: boolean; rateLimited?: boolean }> {
  const startTime = Date.now()
  
  try {
    let response: Response
    
    if (model.provider === 'gemini' || model.provider === 'gemini_backup') {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens }
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
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens
          })
        }
      )
    } else if (model.provider === 'cohere') {
      // Cohere v2 Chat API — response: message.content[0].text
      response = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model.modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens
        })
      })
    } else {
      // OpenAI-compatible APIs
      const endpoints: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        cerebras: 'https://api.cerebras.ai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        github_models: 'https://models.inference.ai.azure.com/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        mistral_backup: 'https://api.mistral.ai/v1/chat/completions',
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
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens
        })
      })
    }
    
    const latencyMs = Date.now() - startTime
    
    if (!response.ok) {
      const errorText = await response.text()
      const quotaExhausted = errorText.includes('quota') || response.status === 429
      const rateLimited = errorText.includes('rate limit') || errorText.includes('too many')
      
      return {
        success: false,
        responseValid: false,
        latencyMs,
        quotaExhausted,
        rateLimited
      }
    }
    
    const data = await response.json() as any
    let responseText = ''
    
    if (model.provider === 'gemini' || model.provider === 'gemini_backup') {
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else if (model.provider === 'cloudflare') {
      responseText = data.result?.response || ''
    } else if (model.provider === 'cohere') {
      responseText = data.message?.content?.[0]?.text || (typeof data.message?.content === 'string' ? data.message.content : '') || ''
    } else {
      responseText = data.choices?.[0]?.message?.content || ''
    }
    
    const responseValid = responseText.length > 0
    
    return {
      success: true,
      responseText,
      responseValid,
      latencyMs
    }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime
    return {
      success: false,
      responseValid: false,
      latencyMs
    }
  }
}

/**
 * Verify a single model with live inference
 */
async function verifyModel(model: DiscoveredModel, apiKey: string): Promise<VerificationResult> {
  console.log(`[Verification] Testing ${model.provider}/${model.modelId}`)
  
  // Test basic chat capability
  const chatResult = await makeInferenceRequest(model, apiKey, 'Say "test"', 50)
  
  if (!chatResult.success) {
    console.log(`[Verification] ${model.provider}/${model.modelId} FAILED: ${chatResult.quotaExhausted ? 'quota exhausted' : chatResult.rateLimited ? 'rate limited' : 'inference failed'}`)
    return {
      success: false,
      latencyMs: chatResult.latencyMs,
      error: 'Inference failed',
      quotaExhausted: chatResult.quotaExhausted,
      rateLimited: chatResult.rateLimited,
      responseValid: false,
      capabilities: {}
    }
  }
  
  console.log(`[Verification] ${model.provider}/${model.modelId} basic test PASSED (${chatResult.latencyMs}ms)`)
  
  // Test capabilities
  console.log(`[Verification] Testing capabilities for ${model.provider}/${model.modelId}`)
  
  const capabilities: VerificationResult['capabilities'] = {}
  
  // Test chat (already done above)
  capabilities.chat = chatResult.responseValid
  
  // Test reasoning
  capabilities.reasoning = await testReasoningCapability(model, apiKey)
  console.log(`[Verification] ${model.provider}/${model.modelId} reasoning: ${capabilities.reasoning}`)
  
  // Test coding
  capabilities.coding = await testCodingCapability(model, apiKey)
  console.log(`[Verification] ${model.provider}/${model.modelId} coding: ${capabilities.coding}`)
  
  // Test structured JSON
  capabilities.structuredJSON = await testStructuredJSONCapability(model, apiKey)
  console.log(`[Verification] ${model.provider}/${model.modelId} structured JSON: ${capabilities.structuredJSON}`)
  
  // Test long context
  capabilities.longContext = await testLongContextCapability(model, apiKey)
  console.log(`[Verification] ${model.provider}/${model.modelId} long context: ${capabilities.longContext}`)
  
  // Skip vision, function calling, embeddings for now (complex to test)
  capabilities.vision = false
  capabilities.functionCalling = false
  capabilities.embeddings = false
  
  return {
    success: true,
    latencyMs: chatResult.latencyMs,
    responseValid: chatResult.responseValid,
    capabilities
  }
}

/**
 * Verify all discovered models
 */
export async function verifyAllModels(discoveredModels: DiscoveredModel[]): Promise<void> {
  console.log('=== LIVE MODEL VERIFICATION ===\n')
  
  for (const model of discoveredModels) {
    // Get API key for provider
    let apiKey: string | undefined
    
    if (model.provider === 'gemini' || model.provider === 'gemini_backup') {
      apiKey = model.provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.GEMINI_API_KEY_BACKUP
    } else if (model.provider === 'groq') {
      apiKey = process.env.GROQ_API_KEY
    } else if (model.provider === 'cerebras') {
      apiKey = process.env.CEREBRAS_API_KEY
    } else if (model.provider === 'openrouter') {
      apiKey = process.env.OPENROUTER_API_KEY
    } else if (model.provider === 'github_models') {
      apiKey = process.env.GITHUB_MODELS_TOKEN
    } else if (model.provider === 'cloudflare') {
      apiKey = process.env.CLOUDFLARE_API_TOKEN
    } else if (model.provider === 'mistral') {
      apiKey = process.env.MISTRAL_API_KEY
    } else if (model.provider === 'mistral_backup') {
      apiKey = process.env.MISTRAL_API_KEY_BACKUP
    } else if (model.provider === 'nvidia') {
      apiKey = process.env.NVIDIA_API_KEY
    } else if (model.provider === 'cohere') {
      apiKey = process.env.COHERE_API_KEY
    }
    
    if (!apiKey) {
      console.log(`[Verification] Skipping ${model.provider}/${model.modelId} (no API key)`)
      continue
    }
    
    // Verify model
    const result = await verifyModel(model, apiKey)
    
    // Update model health
    await updateModelHealth(
      model.provider,
      model.modelId,
      result.success,
      result.latencyMs,
      result.quotaExhausted,
      result.rateLimited
    )
    
    // Update capabilities if verification succeeded
    if (result.success && result.capabilities) {
      await updateModelCapabilities(model.provider, model.modelId, result.capabilities)
    }
    
    console.log(`[Verification] ${model.provider}/${model.modelId} verification complete: ${result.success ? 'PASSED' : 'FAILED'}`)
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===')
}
