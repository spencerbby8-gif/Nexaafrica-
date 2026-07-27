const VERCEL_TOKEN = 'vcp_72rBeQ4ZR8lXt1WDActkS4GxAmxzxKZs7lmFeD3EzjG1moV0Aj3yRdnv'
const PROJECT_ID = 'prj_FDp22Mo7UJIxEUABRVCKXeX6MBXD'

async function getVercelEnvVars() {
  console.log('=== FETCHING VERCEL ENVIRONMENT VARIABLES ===\n')
  
  const response = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env`,
    {
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
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

async function main() {
  console.log('=== AI PROVIDER VERIFICATION ===\n')
  
  const envVars = await getVercelEnvVars()
  
  console.log('\n=== ENVIRONMENT VARIABLES FOUND ===')
  const providerKeys = [
    'GEMINI_API_KEY',
    'GEMINI_API_KEY_BACKUP',
    'GROQ_API_KEY',
    'CEREBRAS_API_KEY',
    'OPENROUTER_API_KEY',
    'GITHUB_TOKEN',
    'CLOUDFLARE_API_TOKEN',
    'MISTRAL_API_KEY',
    'NVIDIA_API_KEY',
    'HUGGINGFACE_API_KEY',
    'COHERE_API_KEY'
  ]
  
  providerKeys.forEach(key => {
    const value = envVars[key]
    if (value) {
      console.log(`✅ ${key}: ${value.substring(0, 10)}...`)
    } else {
      console.log(`❌ ${key}: MISSING`)
    }
  })
  
  console.log('\n=== TESTING PROVIDERS ===')
  
  const results: Record<string, any> = {}
  
  results.gemini = await testGemini(envVars.GEMINI_API_KEY, 'GEMINI (Primary)')
  results.gemini_backup = await testGemini(envVars.GEMINI_API_KEY_BACKUP, 'GEMINI (Backup)')
  results.groq = await testGroq(envVars.GROQ_API_KEY)
  results.cerebras = await testCerebras(envVars.CEREBRAS_API_KEY)
  results.openrouter = await testOpenRouter(envVars.OPENROUTER_API_KEY)
  
  console.log('\n=== SUMMARY ===')
  Object.entries(results).forEach(([provider, result]) => {
    const status = result.success ? '✅' : '❌'
    const latency = result.latency ? `${result.latency}ms` : 'N/A'
    const error = result.error ? ` - ${result.error.substring(0, 50)}` : ''
    console.log(`${status} ${provider}: ${latency}${error}`)
  })
}

main().catch(console.error)
