import { NextRequest, NextResponse } from 'next/server'
import { isPipelineAuthorized } from '@/lib/server/auth'
import { selectGeminiProbeModels } from '@/lib/ai/model-discovery'
import { PROVIDERS } from '@/lib/ai/providers/types'

/**
 * Provider Audit Endpoint
 * Tests all configured providers and their models live
 * GET /api/providers/audit
 * Internal diagnostic: fires real paid model calls, so it requires the
 * pipeline bearer token (CRON_SECRET / INGEST_TOKEN) like every other
 * machine-to-machine route.
 */
export async function GET(request: NextRequest) {
  if (!isPipelineAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const results: any = {}
  
  // Test Gemini
  if (process.env.GEMINI_API_KEY) {
    console.log('Testing Gemini...')
    results.gemini = await testGemini(process.env.GEMINI_API_KEY)
  }
  
  // Test Gemini Backup
  if (process.env.GEMINI_API_KEY_BACKUP) {
    console.log('Testing Gemini Backup...')
    results.gemini_backup = await testGemini(process.env.GEMINI_API_KEY_BACKUP)
  }
  
  // Test Groq
  if (process.env.GROQ_API_KEY) {
    console.log('Testing Groq...')
    results.groq = await testGroq(process.env.GROQ_API_KEY)
  }
  
  // Test Cerebras
  if (process.env.CEREBRAS_API_KEY) {
    console.log('Testing Cerebras...')
    results.cerebras = await testCerebras(process.env.CEREBRAS_API_KEY)
  }
  
  // Test OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    console.log('Testing OpenRouter...')
    results.openrouter = await testOpenRouter(process.env.OPENROUTER_API_KEY)
  }
  
  // Test GitHub Models
  if (process.env.GITHUB_MODELS_TOKEN) {
    console.log('Testing GitHub Models...')
    results.github_models = await testGitHubModels(process.env.GITHUB_MODELS_TOKEN)
  }
  
  // Test Cloudflare
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.log('Testing Cloudflare...')
    results.cloudflare = await testCloudflare(
      process.env.CLOUDFLARE_API_TOKEN,
      process.env.CLOUDFLARE_ACCOUNT_ID
    )
  }
  
  // Test Mistral
  if (process.env.MISTRAL_API_KEY) {
    console.log('Testing Mistral...')
    results.mistral = await testMistral(process.env.MISTRAL_API_KEY)
  }
  
  // Test NVIDIA
  if (process.env.NVIDIA_API_KEY) {
    console.log('Testing NVIDIA...')
    results.nvidia = await testNvidia(process.env.NVIDIA_API_KEY)
  }
  
  // Test Cohere
  if (process.env.COHERE_API_KEY) {
    console.log('Testing Cohere...')
    results.cohere = await testCohere(process.env.COHERE_API_KEY)
  }
  
  return NextResponse.json(results)
}

/**
 * Test Cohere (OpenAI-compatible endpoint).
 * Probes the configured model + up to 2 additional command-family models
 * from the live catalog — never a hardcoded dead list.
 */
async function testCohere(apiKey: string) {
  const configured = PROVIDERS.find((p) => p.id === 'cohere')?.model || 'command-r-plus-08-2024'
  const models = [configured]
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://api.cohere.ai/compatibility/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || [])
        .map((m: any) => m.id)
        .filter((id: string) => /^command/i.test(id))
      // add the top 2 additional command models for coverage
      for (const id of catalog) {
        if (!models.includes(id)) models.push(id)
        if (models.length >= 3) break
      }
    }
  } catch (e: any) {
    console.log('Cohere catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://api.cohere.ai/compatibility/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter((r) => r.success).length,
    results
  }
}

async function testGemini(apiKey: string) {
  // [RELIABILITY] Probe list derived from the LIVE catalog + the configured
  // provider models — never hardcoded. The old hardcoded list
  // (gemini-2.5-flash / 2.5-pro / 2.0-flash / 1.5-flash / 1.5-pro) was 100%
  // dead models (1.5 shut down, 2.0 shut down 2026-06-01, 2.5-flash pulled
  // early for new users) and wasted 5 live calls on guaranteed 404s per audit.
  const configured = PROVIDERS.filter((p) => p.id === 'gemini' || p.id === 'gemini_backup').map((p) => p.model)
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.models || []).map((m: any) => m.name.replace('models/', ''))
    }
  } catch (e: any) {
    console.log('Gemini catalog error:', e.message)
  }
  
  const models = selectGeminiProbeModels(catalog, configured, 5)
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "test"' }] }],
            generationConfig: { maxOutputTokens: 20 }
          })
        }
      )
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testGroq(apiKey: string) {
  const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || []).map((m: any) => m.id)
    }
  } catch (e: any) {
    console.log('Groq catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testCerebras(apiKey: string) {
  const models = ['llama3.1-70b', 'llama3.1-8b', 'gpt-oss-120b']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://api.cerebras.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || data.models || []).map((m: any) => m.id || m.name)
    }
  } catch (e: any) {
    console.log('Cerebras catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testOpenRouter(apiKey: string) {
  // [RELIABILITY] google/gemini-2.0-flash-exp:free is shut down (2.0 line
  // ended 2026-06-01; no Gemini :free variants remain on OpenRouter — verified
  // via the live models API). Replaced with the current stable gemini-3.5-flash.
  const models = ['meta-llama/llama-3.3-70b-instruct', 'google/gemini-3.5-flash', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o-mini', 'mistralai/mixtral-8x7b-instruct']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || []).map((m: any) => m.id)
    }
  } catch (e: any) {
    console.log('OpenRouter catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://nexaafrica.vercel.app',
          'X-Title': 'Nexa Africa'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testGitHubModels(apiKey: string) {
  const models = ['gpt-4o-mini', 'llama-3.1-70b-instruct', 'phi-3-medium-128k-instruct', 'mistral-large', 'cohere-command-r-plus']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://models.inference.ai.azure.com/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'api-version': '2024-05-01-preview'
      }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || []).map((m: any) => m.id || m.name)
    }
  } catch (e: any) {
    console.log('GitHub Models catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'api-version': '2024-05-01-preview'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testCloudflare(apiToken: string, accountId: string) {
  const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
      {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      }
    )
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.result || []).map((m: any) => m.name || m.id)
    }
  } catch (e: any) {
    console.log('Cloudflare catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Say "test"' }],
            max_tokens: 20
          })
        }
      )
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.result?.response || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.some((c: string) => c.includes(model.replace('@cf/', '')))
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.some((c: string) => c.includes(model.replace('@cf/', '')))
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testMistral(apiKey: string) {
  const models = ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-7b', 'open-mixtral-8x7b', 'codestral-latest']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || []).map((m: any) => m.id)
    }
  } catch (e: any) {
    console.log('Mistral catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}

async function testNvidia(apiKey: string) {
  const models = ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct', 'mistralai/mixtral-8x7b-instruct-v0.1', 'nvidia/nemotron-4-340b-instruct']
  const results: any[] = []
  
  // Query catalog
  let catalog: any[] = []
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (response.ok) {
      const data = await response.json() as any
      catalog = (data.data || []).map((m: any) => m.id)
    }
  } catch (e: any) {
    console.log('NVIDIA catalog error:', e.message)
  }
  
  // Test each model
  for (const model of models) {
    const start = Date.now()
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 20
        })
      })
      
      const latency = Date.now() - start
      
      if (response.ok) {
        const data = await response.json() as any
        const text = data.choices?.[0]?.message?.content || ''
        results.push({
          model,
          success: true,
          latency,
          response: text.substring(0, 50),
          inCatalog: catalog.includes(model)
        })
      } else {
        const error = await response.text()
        results.push({
          model,
          success: false,
          latency,
          error: `${response.status}: ${error.substring(0, 100)}`,
          inCatalog: catalog.includes(model)
        })
      }
    } catch (e: any) {
      results.push({
        model,
        success: false,
        latency: Date.now() - start,
        error: e.message
      })
    }
  }
  
  return {
    catalog: catalog.length,
    tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  }
}
