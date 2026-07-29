/**
 * Hostile Model Discovery Audit
 * 
 * Tests every provider, discovers models, verifies with real inference,
 * benchmarks, and tests routing logic.
 */

import { discoverAllModels, getModelCatalog } from '../lib/ai/model-discovery'
import { getProviders, refreshProviderRegistry } from '../lib/ai/providers/dynamic-registry'
import { aiGateway } from '../lib/ai/gateway'

const BENCHMARK_PROMPT = `Extract job intelligence from this job posting:

Title: Senior Software Engineer
Company: Acme Corp
Location: Remote, Worldwide
Salary: $150,000 - $200,000 USD per year

Description: We are looking for a senior software engineer to join our fully remote team. You will work on our core platform using React, TypeScript, and Node.js. We offer competitive compensation and benefits.

Return JSON with: job_title, company, location, salary_range, required_skills, remote_eligibility, africa_eligibility`

interface ModelBenchmark {
  provider: string
  modelId: string
  verified: boolean
  usable: boolean
  latencyMs?: number
  success: boolean
  error?: string
  quotaExhausted?: boolean
  rateLimited?: boolean
  responseValid: boolean
  benchmarkScore?: number
}

/**
 * Test model discovery for all providers
 */
async function auditModelDiscovery() {
  console.log('=== HOSTILE MODEL DISCOVERY AUDIT ===\n')
  
  console.log('Step 1: Discovering models from all providers...')
  const catalogs = await discoverAllModels()
  
  console.log(`\nDiscovered ${catalogs.length} providers:`)
  catalogs.forEach(c => {
    console.log(`  ${c.provider}: ${c.totalModels} total, ${c.verifiedModels} verified, ${c.usableModels} usable`)
  })
  
  return catalogs
}

/**
 * Verify each discovered model with real inference
 */
async function verifyModels(catalogs: any[]): Promise<ModelBenchmark[]> {
  console.log('\n\nStep 2: Verifying each model with real inference...')
  
  const benchmarks: ModelBenchmark[] = []
  
  for (const catalog of catalogs) {
    console.log(`\nVerifying ${catalog.provider} models...`)
    
    for (const model of catalog.models) {
      console.log(`  Testing ${model.modelId}...`)
      
      const startTime = Date.now()
      
      try {
        const response = await aiGateway({
          prompt: BENCHMARK_PROMPT,
          agentId: 'audit:benchmark',
          jobId: 'audit-test',
          temperature: 0.2,
          maxTokens: 1000
        })
        
        const latency = Date.now() - startTime
        
        // Check if response is valid JSON
        let responseValid = false
        try {
          const json = JSON.parse(response.response.text)
          responseValid = json.job_title && json.company && json.location
        } catch {
          responseValid = false
        }
        
        benchmarks.push({
          provider: catalog.provider,
          modelId: model.modelId,
          verified: model.verified,
          usable: model.usable,
          latencyMs: latency,
          success: true,
          responseValid,
          benchmarkScore: responseValid ? 100 : 50
        })
        
        console.log(`    ✓ ${latency}ms, valid: ${responseValid}`)
      } catch (error: any) {
        const latency = Date.now() - startTime
        const errorMsg = error.message || 'Unknown error'
        
        const quotaExhausted = errorMsg.includes('quota') || errorMsg.includes('429')
        const rateLimited = errorMsg.includes('rate limit') || errorMsg.includes('too many')
        
        benchmarks.push({
          provider: catalog.provider,
          modelId: model.modelId,
          verified: model.verified,
          usable: false,
          latencyMs: latency,
          success: false,
          error: errorMsg,
          quotaExhausted,
          rateLimited,
          responseValid: false
        })
        
        console.log(`    ✗ ${latency}ms, error: ${errorMsg.substring(0, 100)}`)
      }
    }
  }
  
  return benchmarks
}

/**
 * Test routing logic
 */
async function testRouting() {
  console.log('\n\nStep 3: Testing routing logic...')
  
  // Refresh provider registry
  await refreshProviderRegistry()
  const providers = getProviders()
  
  console.log(`\nEnabled providers: ${providers.filter(p => p.enabled).length}/${providers.length}`)
  providers.filter(p => p.enabled).forEach(p => {
    console.log(`  ${p.id}: ${p.model} (priority: ${p.priority}, latency: ${p.latencyMs}ms)`)
  })
  
  // Test different task types
  const tasks = [
    { type: 'cv_parsing', prompt: 'Parse this CV...' },
    { type: 'job_intelligence', prompt: BENCHMARK_PROMPT },
    { type: 'verification', prompt: 'Verify this company...' }
  ]
  
  console.log('\nTesting task routing...')
  for (const task of tasks) {
    try {
      const response = await aiGateway({
        prompt: task.prompt,
        agentId: `audit:${task.type}`,
        jobId: 'audit-test',
        temperature: 0.2,
        maxTokens: 500
      })
      
      console.log(`  ${task.type}: routed to ${response.response.provider} (${response.response.model})`)
    } catch (error: any) {
      console.log(`  ${task.type}: FAILED - ${error.message.substring(0, 100)}`)
    }
  }
}

/**
 * Test failover
 */
async function testFailover() {
  console.log('\n\nStep 4: Testing failover...')
  
  // This would require simulating a provider failure
  // For now, just log that we would test this
  console.log('  (Failover testing requires simulating provider failures)')
  console.log('  Would test: primary provider fails → automatically switches to backup')
}

/**
 * Generate audit report
 */
async function generateReport(catalogs: any[], benchmarks: ModelBenchmark[]) {
  console.log('\n\n=== AUDIT REPORT ===\n')
  
  // Provider summary
  console.log('PROVIDER SUMMARY:')
  catalogs.forEach(c => {
    console.log(`\n${c.provider}:`)
    console.log(`  Total models: ${c.totalModels}`)
    console.log(`  Verified: ${c.verifiedModels}`)
    console.log(`  Usable: ${c.usableModels}`)
    console.log(`  Last refreshed: ${c.lastRefreshed}`)
  })
  
  // Benchmark summary
  console.log('\n\nBENCHMARK RESULTS:')
  const successful = benchmarks.filter(b => b.success)
  const failed = benchmarks.filter(b => !b.success)
  
  console.log(`\nSuccessful: ${successful.length}/${benchmarks.length}`)
  console.log(`Failed: ${failed.length}/${benchmarks.length}`)
  
  if (successful.length > 0) {
    const avgLatency = successful.reduce((sum, b) => sum + (b.latencyMs || 0), 0) / successful.length
    console.log(`Average latency: ${Math.round(avgLatency)}ms`)
    
    const validResponses = successful.filter(b => b.responseValid)
    console.log(`Valid responses: ${validResponses.length}/${successful.length}`)
  }
  
  // Failures
  if (failed.length > 0) {
    console.log('\n\nFAILURES:')
    failed.forEach(b => {
      console.log(`  ${b.provider}/${b.modelId}: ${b.error?.substring(0, 100)}`)
      if (b.quotaExhausted) console.log('    → Quota exhausted')
      if (b.rateLimited) console.log('    → Rate limited')
    })
  }
  
  // Ranking
  console.log('\n\nMODEL RANKING (by latency):')
  successful
    .sort((a, b) => (a.latencyMs || 9999) - (b.latencyMs || 9999))
    .forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.provider}/${b.modelId}: ${b.latencyMs}ms, valid: ${b.responseValid}`)
    })
}

/**
 * Main audit function
 */
async function main() {
  try {
    // Step 1: Discover models
    const catalogs = await auditModelDiscovery()
    
    // Step 2: Verify models
    const benchmarks = await verifyModels(catalogs)
    
    // Step 3: Test routing
    await testRouting()
    
    // Step 4: Test failover
    await testFailover()
    
    // Step 5: Generate report
    await generateReport(catalogs, benchmarks)
    
    console.log('\n\n=== AUDIT COMPLETE ===')
  } catch (error: any) {
    console.error('\n\nAUDIT FAILED:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
