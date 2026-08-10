/**
 * Nexa Model Benchmarking
 * 
 * Benchmarks every usable model on real Nexa tasks:
 * - Job intelligence extraction
 * - Trust verification
 * - Africa eligibility detection
 * - Salary extraction
 * - Company verification
 * - CV parsing
 * - Evidence generation
 * - Structured JSON output
 */

import type { DiscoveredModel } from './model-discovery'
import { updateModelBenchmarks } from './model-registry'

interface BenchmarkTask {
  name: string
  prompt: string
  maxTokens: number
  validate: (response: string) => number  // Returns score 0-100
}

const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    name: 'jobIntelligence',
    prompt: `Extract job intelligence from this job posting:

Title: Senior Software Engineer
Company: Acme Corp
Location: Remote, Worldwide
Salary: $150,000 - $200,000 USD per year

Description: We are looking for a senior software engineer to join our fully remote team. You will work on our core platform using React, TypeScript, and Node.js. We offer competitive compensation and benefits.

Return JSON with: job_title, company, location, salary_range, required_skills, remote_eligibility, africa_eligibility`,
    maxTokens: 1000,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (json.job_title) score += 15
        if (json.company) score += 15
        if (json.location) score += 15
        if (json.salary_range) score += 15
        if (json.required_skills && Array.isArray(json.required_skills)) score += 20
        if (json.remote_eligibility) score += 10
        if (json.africa_eligibility) score += 10
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'trustVerification',
    prompt: `Verify the trustworthiness of this company:

Company: Acme Corp
Website: https://acme.com
Founded: 2010
Employees: 500
Website age: 15 years
SSL: Valid

Return JSON with: trust_score (0-100), reasons (array of strings), red_flags (array of strings)`,
    maxTokens: 800,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (typeof json.trust_score === 'number' && json.trust_score >= 0 && json.trust_score <= 100) score += 40
        if (json.reasons && Array.isArray(json.reasons) && json.reasons.length > 0) score += 30
        if (json.red_flags && Array.isArray(json.red_flags)) score += 30
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'africaEligibility',
    prompt: `Determine if this job is open to African applicants:

Title: Senior Software Engineer
Company: Acme Corp
Location: Remote, Worldwide
Description: We are looking for a senior software engineer to join our fully remote team. We hire from anywhere in the world.

Return JSON with: eligibility (explicit/likely/restricted/unknown), confidence (0-100), evidence (string)`,
    maxTokens: 500,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (['explicit', 'likely', 'restricted', 'unknown'].includes(json.eligibility)) score += 40
        if (typeof json.confidence === 'number' && json.confidence >= 0 && json.confidence <= 100) score += 30
        if (typeof json.evidence === 'string' && json.evidence.length > 0) score += 30
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'salaryExtraction',
    prompt: `Extract salary information from this job posting:

Title: Senior Software Engineer
Company: Acme Corp
Description: We offer competitive compensation. Salary range: $150,000 - $200,000 USD per year. We also offer equity and benefits.

Return JSON with: salary_min (number), salary_max (number), currency (string), period (string), evidence (string)`,
    maxTokens: 500,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (typeof json.salary_min === 'number' && json.salary_min === 150000) score += 25
        if (typeof json.salary_max === 'number' && json.salary_max === 200000) score += 25
        if (json.currency === 'USD') score += 20
        if (json.period === 'year') score += 15
        if (typeof json.evidence === 'string' && json.evidence.length > 0) score += 15
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'companyVerification',
    prompt: `Verify this company:

Company: Acme Corp
Website: https://acme.com
Description: Acme Corp is a leading technology company founded in 2010. We build innovative solutions for enterprise customers.

Return JSON with: legitimacy (verified/likely_legit/unknown/suspicious), confidence (0-100), evidence (string)`,
    maxTokens: 500,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (['verified', 'likely_legit', 'unknown', 'suspicious'].includes(json.legitimacy)) score += 40
        if (typeof json.confidence === 'number' && json.confidence >= 0 && json.confidence <= 100) score += 30
        if (typeof json.evidence === 'string' && json.evidence.length > 0) score += 30
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'cvParsing',
    prompt: `Parse this CV:

John Doe
Senior Software Engineer

Experience:
- Senior Software Engineer at Acme Corp (2020-Present)
  Led development of core platform using React and Node.js
- Software Engineer at TechCo (2018-2020)
  Built microservices and APIs

Skills: React, TypeScript, Node.js, Python, AWS

Education:
- BS Computer Science, University of Tech (2018)

Return JSON with: name (string), headline (string), experience (array), skills (array), education (array)`,
    maxTokens: 1500,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (json.name === 'John Doe') score += 20
        if (typeof json.headline === 'string' && json.headline.length > 0) score += 15
        if (json.experience && Array.isArray(json.experience) && json.experience.length >= 2) score += 25
        if (json.skills && Array.isArray(json.skills) && json.skills.length >= 4) score += 20
        if (json.education && Array.isArray(json.education) && json.education.length >= 1) score += 20
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'evidenceGeneration',
    prompt: `Generate evidence for this claim:

Claim: This job is open to African applicants
Job posting: We are looking for a senior software engineer to join our fully remote team. We hire from anywhere in the world.

Return JSON with: evidence (string), confidence (0-100), reasoning (string)`,
    maxTokens: 500,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (typeof json.evidence === 'string' && json.evidence.length > 20) score += 40
        if (typeof json.confidence === 'number' && json.confidence >= 0 && json.confidence <= 100) score += 30
        if (typeof json.reasoning === 'string' && json.reasoning.length > 20) score += 30
        
        return score
      } catch {
        return 0
      }
    }
  },
  {
    name: 'structuredJSON',
    prompt: `Return a JSON object with these fields:
- name (string): "John Doe"
- age (number): 30
- active (boolean): true
- skills (array of strings): ["JavaScript", "Python"]
- address (object): {"city": "San Francisco", "country": "USA"}

Return only JSON, no other text.`,
    maxTokens: 300,
    validate: (response: string) => {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return 0
        
        const json = JSON.parse(jsonMatch[0])
        let score = 0
        
        if (json.name === 'John Doe') score += 20
        if (json.age === 30) score += 20
        if (json.active === true) score += 20
        if (json.skills && Array.isArray(json.skills) && json.skills.length === 2) score += 20
        if (json.address && typeof json.address === 'object' && json.address.city === 'San Francisco') score += 20
        
        return score
      } catch {
        return 0
      }
    }
  }
]

/**
 * Make inference request to model
 */
async function makeInferenceRequest(
  model: DiscoveredModel,
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<{ success: boolean; responseText?: string; latencyMs: number }> {
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
    } else {
      // OpenAI-compatible APIs
      const endpoints: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        cerebras: 'https://api.cerebras.ai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        github_models: 'https://models.github.ai/inference/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions'
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
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
      return {
        success: false,
        latencyMs
      }
    }
    
    const data = await response.json() as any
    let responseText = ''
    
    if (model.provider === 'gemini' || model.provider === 'gemini_backup') {
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else if (model.provider === 'cloudflare') {
      responseText = data.result?.response || ''
    } else {
      responseText = data.choices?.[0]?.message?.content || ''
    }
    
    return {
      success: true,
      responseText,
      latencyMs
    }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime
    return {
      success: false,
      latencyMs
    }
  }
}

/**
 * Benchmark a single model on all Nexa tasks
 */
async function benchmarkModel(model: DiscoveredModel, apiKey: string): Promise<Record<string, number>> {
  console.log(`[Benchmark] Benchmarking ${model.provider}/${model.modelId}`)
  
  const results: Record<string, number> = {}
  
  for (const task of BENCHMARK_TASKS) {
    console.log(`[Benchmark] Testing ${task.name} on ${model.provider}/${model.modelId}`)
    
    const response = await makeInferenceRequest(model, apiKey, task.prompt, task.maxTokens)
    
    if (!response.success || !response.responseText) {
      console.log(`[Benchmark] ${task.name} FAILED on ${model.provider}/${model.modelId}`)
      results[task.name] = 0
      continue
    }
    
    const score = task.validate(response.responseText)
    console.log(`[Benchmark] ${task.name} on ${model.provider}/${model.modelId}: ${score}/100 (${response.latencyMs}ms)`)
    results[task.name] = score
  }
  
  return results
}

/**
 * Benchmark all usable models
 */
export async function benchmarkAllModels(discoveredModels: DiscoveredModel[]): Promise<void> {
  console.log('=== NEXA MODEL BENCHMARKING ===\n')
  
  for (const model of discoveredModels) {
    // Skip if model is not usable
    if (!model.health.usable) {
      console.log(`[Benchmark] Skipping ${model.provider}/${model.modelId} (not usable)`)
      continue
    }
    
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
    } else if (model.provider === 'nvidia') {
      apiKey = process.env.NVIDIA_API_KEY
    }
    
    if (!apiKey) {
      console.log(`[Benchmark] Skipping ${model.provider}/${model.modelId} (no API key)`)
      continue
    }
    
    // Benchmark model
    const results = await benchmarkModel(model, apiKey)
    
    // Update benchmarks in registry
    await updateModelBenchmarks(model.provider, model.modelId, results)
    
    console.log(`[Benchmark] ${model.provider}/${model.modelId} benchmarking complete`)
  }
  
  console.log('\n=== BENCHMARKING COMPLETE ===')
}
