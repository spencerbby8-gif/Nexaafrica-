const VERCEL_TOKEN = 'vcp_72rBeQ4ZR8lXt1WDActkS4GxAmxzxKZs7lmFeD3EzjG1moV0Aj3yRdnv'
const PROJECT_ID = 'prj_FDp22Mo7UJIxEUABRVCKXeX6MBXD'

async function getVercelEnvVars() {
  console.log('=== FETCHING VERCEL ENVIRONMENT VARIABLES ===\n')
  
  const response = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env`,
    {
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`
      }
    }
  )
  
  if (!response.ok) {
    console.error('Failed to fetch env vars:', response.statusText)
    return {}
  }
  
  const data = await response.json() as any
  const envVars: Record<string, string> = {}
  
  data.envs.forEach((env: any) => {
    envVars[env.key] = env.value
  })
  
  return envVars
}

async function testGemini(apiKey: string, label: string) {
  console.log(`\n=== TESTING ${label} ===`)
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.'
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1000
          }
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function testGroq(apiKey: string) {
  console.log('\n=== TESTING GROQ ===')
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.'
          }],
          temperature: 0.2,
          max_tokens: 1000
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function testCerebras(apiKey: string) {
  console.log('\n=== TESTING CEREBRAS ===')
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama3.1-70b',
          messages: [{
            role: 'user',
            content: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.'
          }],
          temperature: 0.2,
          max_tokens: 1000
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function testOpenRouter(apiKey: string) {
  console.log('\n=== TESTING OPENROUTER ===')
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://nexaafrica.vercel.app',
          'X-Title': 'Nexa Africa'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct',
          messages: [{
            role: 'user',
            content: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.'
          }],
          temperature: 0.2,
          max_tokens: 1000
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function testHuggingFace(apiKey: string) {
  console.log('\n=== TESTING HUGGING FACE ===')
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          inputs: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.',
          parameters: {
            max_new_tokens: 1000,
            temperature: 0.2
          }
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data[0]?.generated_text || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function testCohere(apiKey: string) {
  console.log('\n=== TESTING COHERE ===')
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://api.cohere.ai/v1/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'command-r-plus',
          message: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.',
          temperature: 0.2,
          max_tokens: 1000
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data.text || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function testMistral(apiKey: string) {
  console.log('\n=== TESTING MISTRAL ===')
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING')
  
  if (!apiKey) {
    console.log('❌ SKIP: No API key')
    return { success: false, error: 'No API key' }
  }
  
  const startTime = Date.now()
  try {
    const response = await fetch(
      'https://api.mistral.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: [{
            role: 'user',
            content: 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON with: job_title, company, remote_eligibility, salary_range, confidence.'
          }],
          temperature: 0.2,
          max_tokens: 1000
        })
      }
    )
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const error = await response.text()
      console.log(`❌ FAILED: ${response.status} - ${error.substring(0, 200)}`)
      return { success: false, error: `${response.status}: ${error.substring(0, 100)}`, latency }
    }
    
    const data = await response.json() as any
    const text = data.choices?.[0]?.message?.content || ''
    
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log('Response preview:', text.substring(0, 200))
    
    return { success: true, latency, responseLength: text.length }
  } catch (error: any) {
    const latency = Date.now() - startTime
    console.log(`❌ ERROR: ${error.message}`)
    return { success: false, error: error.message, latency }
  }
}

async function main() {
  console.log('=== AI PROVIDER VERIFICATION ===\n')
  
  const envVars = await getVercelEnvVars()
  
  console.log('\n=== ALL ENVIRONMENT VARIABLES ===')
  const sortedKeys = Object.keys(envVars).sort()
  sortedKeys.forEach(key => {
    const value = envVars[key]
    const preview = value ? value.substring(0, 20) : 'EMPTY'
    console.log(`  ${key}: ${preview}...`)
  })
  
  console.log('\n=== TESTING CONFIGURED PROVIDERS ===')
  
  const results: Record<string, any> = {}
  
  // Test providers that have API keys
  if (envVars.GEMINI_API_KEY) {
    results.gemini = await testGemini(envVars.GEMINI_API_KEY, 'GEMINI (Primary)')
  }
  
  if (envVars.GEMINI_API_KEY_BACKUP) {
    results.gemini_backup = await testGemini(envVars.GEMINI_API_KEY_BACKUP, 'GEMINI (Backup)')
  }
  
  if (envVars.GROQ_API_KEY) {
    results.groq = await testGroq(envVars.GROQ_API_KEY)
  }
  
  if (envVars.CEREBRAS_API_KEY) {
    results.cerebras = await testCerebras(envVars.CEREBRAS_API_KEY)
  }
  
  if (envVars.OPENROUTER_API_KEY) {
    results.openrouter = await testOpenRouter(envVars.OPENROUTER_API_KEY)
  }
  
  if (envVars.HUGGINGFACE_API_KEY) {
    results.huggingface = await testHuggingFace(envVars.HUGGINGFACE_API_KEY)
  }
  
  if (envVars.COHERE_API_KEY) {
    results.cohere = await testCohere(envVars.COHERE_API_KEY)
  }
  
  if (envVars.MISTRAL_API_KEY) {
    results.mistral = await testMistral(envVars.MISTRAL_API_KEY)
  }
  
  console.log('\n=== SUMMARY ===')
  Object.entries(results).forEach(([provider, result]) => {
    const status = result.success ? '✅' : '❌'
    const latency = result.latency ? `${result.latency}ms` : 'N/A'
    const error = result.error ? ` - ${result.error.substring(0, 50)}` : ''
    console.log(`${status} ${provider}: ${latency}${error}`)
  })
  
  console.log('\n=== PROVIDERS NOT CONFIGURED ===')
  const configuredProviders = ['GEMINI_API_KEY', 'GEMINI_API_KEY_BACKUP', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY', 'HUGGINGFACE_API_KEY', 'COHERE_API_KEY', 'MISTRAL_API_KEY']
  configuredProviders.forEach(key => {
    if (!envVars[key]) {
      console.log(`  ❌ ${key}: Not configured`)
    }
  })
}

main().catch(console.error)
