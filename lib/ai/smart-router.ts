/**
 * Smart AI Router
 * 
 * Routes tasks to the best model based on:
 * - Capability (does model support required capability?)
 * - Benchmark score (how well does model perform on this task?)
 * - Health score (is model healthy?)
 * - Latency (how fast is model?)
 * - Quota status (does model have quota?)
 * - Cooldown state (is model in cooldown?)
 * - Availability (is model enabled and usable?)
 */

import type { ModelRecord } from './model-registry'
import { getEnabledModels } from './model-registry'

export type TaskType = 
  | 'chat'
  | 'reasoning'
  | 'coding'
  | 'vision'
  | 'functionCalling'
  | 'structuredJSON'
  | 'embeddings'
  | 'longContext'
  | 'jobIntelligence'
  | 'trustVerification'
  | 'africaEligibility'
  | 'salaryExtraction'
  | 'companyVerification'
  | 'cvParsing'
  | 'evidenceGeneration'

export interface RoutingDecision {
  model: ModelRecord
  score: number
  reasoning: string
}

/**
 * Calculate routing score for a model on a specific task
 */
function calculateRoutingScore(model: ModelRecord, taskType: TaskType): { score: number; reasoning: string } {
  let score = 0
  const reasoning: string[] = []
  
  // Check if model is enabled and usable
  if (!model.enabled || !model.health.usable) {
    return { score: -9999, reasoning: 'Model not enabled or usable' }
  }
  
  // Check cooldown
  if (model.health.cooldownUntil && new Date(model.health.cooldownUntil) > new Date()) {
    return { score: -9999, reasoning: 'Model in cooldown' }
  }
  
  // Check quota
  if (model.health.quotaStatus === 'exhausted') {
    return { score: -9999, reasoning: 'Quota exhausted' }
  }
  
  // Capability score (0-40 points)
  let capabilityScore = 0
  if (taskType === 'chat' && model.capabilities.chat) {
    capabilityScore = 40
    reasoning.push('Supports chat')
  } else if (taskType === 'reasoning' && model.capabilities.reasoning) {
    capabilityScore = 40
    reasoning.push('Supports reasoning')
  } else if (taskType === 'coding' && model.capabilities.coding) {
    capabilityScore = 40
    reasoning.push('Supports coding')
  } else if (taskType === 'structuredJSON' && model.capabilities.structuredJSON) {
    capabilityScore = 40
    reasoning.push('Supports structured JSON')
  } else if (taskType === 'longContext' && model.capabilities.longContext) {
    capabilityScore = 40
    reasoning.push('Supports long context')
  } else if (taskType === 'jobIntelligence' && model.capabilities.structuredJSON) {
    capabilityScore = 35  // Slightly lower since it's not a direct capability
    reasoning.push('Supports structured JSON (required for job intelligence)')
  } else if (taskType === 'trustVerification' && model.capabilities.structuredJSON) {
    capabilityScore = 35
    reasoning.push('Supports structured JSON (required for trust verification)')
  } else if (taskType === 'africaEligibility' && model.capabilities.structuredJSON) {
    capabilityScore = 35
    reasoning.push('Supports structured JSON (required for Africa eligibility)')
  } else if (taskType === 'salaryExtraction' && model.capabilities.structuredJSON) {
    capabilityScore = 35
    reasoning.push('Supports structured JSON (required for salary extraction)')
  } else if (taskType === 'companyVerification' && model.capabilities.structuredJSON) {
    capabilityScore = 35
    reasoning.push('Supports structured JSON (required for company verification)')
  } else if (taskType === 'cvParsing' && model.capabilities.structuredJSON) {
    capabilityScore = 35
    reasoning.push('Supports structured JSON (required for CV parsing)')
  } else if (taskType === 'evidenceGeneration' && model.capabilities.chat) {
    capabilityScore = 30
    reasoning.push('Supports chat (required for evidence generation)')
  } else {
    // Model doesn't support required capability
    return { score: -9999, reasoning: `Model doesn't support ${taskType}` }
  }
  
  score += capabilityScore
  
  // Benchmark score (0-30 points)
  let benchmarkScore = 0
  if (model.benchmarks.overallScore !== undefined) {
    benchmarkScore = (model.benchmarks.overallScore / 100) * 30
    reasoning.push(`Benchmark score: ${model.benchmarks.overallScore}/100`)
  } else {
    benchmarkScore = 15  // Default if not benchmarked
    reasoning.push('Not benchmarked (default score)')
  }
  
  score += benchmarkScore
  
  // Health score (0-15 points)
  const healthScore = (model.health.healthScore / 100) * 15
  score += healthScore
  reasoning.push(`Health score: ${model.health.healthScore}/100`)
  
  // Success rate (0-10 points)
  const successRateScore = (model.health.successRate / 100) * 10
  score += successRateScore
  reasoning.push(`Success rate: ${model.health.successRate.toFixed(1)}%`)
  
  // Latency (0-5 points, lower is better)
  let latencyScore = 0
  if (model.health.avgLatencyMs > 0) {
    // Max 5 points for <500ms, decreasing as latency increases
    latencyScore = Math.max(0, 5 - (model.health.avgLatencyMs / 1000))
    reasoning.push(`Avg latency: ${model.health.avgLatencyMs}ms`)
  }
  
  score += latencyScore
  
  return { score, reasoning: reasoning.join(', ') }
}

/**
 * Select best model for a task
 */
export async function selectModel(taskType: TaskType): Promise<RoutingDecision | null> {
  console.log(`[Router] Selecting model for task: ${taskType}`)
  
  const models = await getEnabledModels()
  
  if (models.length === 0) {
    console.log('[Router] No enabled models available')
    return null
  }
  
  console.log(`[Router] Evaluating ${models.length} enabled models`)
  
  // Calculate scores for all models
  const decisions: RoutingDecision[] = models.map(model => {
    const { score, reasoning } = calculateRoutingScore(model, taskType)
    return { model, score, reasoning }
  })
  
  // Sort by score (descending)
  decisions.sort((a, b) => b.score - a.score)
  
  // Get best model
  const best = decisions[0]
  
  if (!best || best.score <= 0) {
    console.log('[Router] No suitable model found')
    return null
  }
  
  console.log(`[Router] Selected ${best.model.provider}/${best.model.modelId} (score: ${best.score.toFixed(2)})`)
  console.log(`[Router] Reasoning: ${best.reasoning}`)
  
  return best
}

/**
 * Select model with failover
 */
export async function selectModelWithFailover(taskType: TaskType, maxAttempts: number = 3): Promise<RoutingDecision | null> {
  console.log(`[Router] Selecting model with failover for task: ${taskType}`)
  
  const models = await getEnabledModels()
  
  if (models.length === 0) {
    console.log('[Router] No enabled models available')
    return null
  }
  
  // Calculate scores for all models
  const decisions: RoutingDecision[] = models.map(model => {
    const { score, reasoning } = calculateRoutingScore(model, taskType)
    return { model, score, reasoning }
  })
  
  // Sort by score (descending)
  decisions.sort((a, b) => b.score - a.score)
  
  // Try top models
  for (let i = 0; i < Math.min(maxAttempts, decisions.length); i++) {
    const decision = decisions[i]
    
    if (decision.score <= 0) {
      console.log(`[Router] No more suitable models (attempt ${i + 1}/${maxAttempts})`)
      break
    }
    
    console.log(`[Router] Attempt ${i + 1}/${maxAttempts}: ${decision.model.provider}/${decision.model.modelId} (score: ${decision.score.toFixed(2)})`)
    
    // For now, just return the decision
    // In a real implementation, we would try the model and failover if it fails
    return decision
  }
  
  console.log('[Router] No suitable model found after all attempts')
  return null
}

/**
 * Get routing statistics
 */
export async function getRoutingStats() {
  const models = await getEnabledModels()
  
  const stats = {
    totalModels: models.length,
    enabledModels: models.filter(m => m.enabled).length,
    usableModels: models.filter(m => m.health.usable).length,
    byCapability: {
      chat: models.filter(m => m.capabilities.chat).length,
      reasoning: models.filter(m => m.capabilities.reasoning).length,
      coding: models.filter(m => m.capabilities.coding).length,
      structuredJSON: models.filter(m => m.capabilities.structuredJSON).length,
      longContext: models.filter(m => m.capabilities.longContext).length
    },
    topModels: models
      .filter(m => m.enabled && m.health.usable)
      .sort((a, b) => (b.benchmarks.overallScore || 0) - (a.benchmarks.overallScore || 0))
      .slice(0, 5)
      .map(m => ({
        provider: m.provider,
        modelId: m.modelId,
        benchmarkScore: m.benchmarks.overallScore || 0,
        healthScore: m.health.healthScore,
        latency: m.health.avgLatencyMs
      }))
  }
  
  return stats
}

/**
 * Test routing with different task types
 */
export async function testRouting(): Promise<void> {
  console.log('=== TESTING SMART ROUTING ===\n')
  
  const taskTypes: TaskType[] = [
    'chat',
    'reasoning',
    'coding',
    'structuredJSON',
    'jobIntelligence',
    'trustVerification',
    'africaEligibility',
    'salaryExtraction',
    'companyVerification',
    'cvParsing',
    'evidenceGeneration'
  ]
  
  for (const taskType of taskTypes) {
    const decision = await selectModel(taskType)
    
    if (decision) {
      console.log(`[Routing Test] ${taskType}: ${decision.model.provider}/${decision.model.modelId} (score: ${decision.score.toFixed(2)})`)
    } else {
      console.log(`[Routing Test] ${taskType}: NO SUITABLE MODEL`)
    }
  }
  
  console.log('\n=== ROUTING TEST COMPLETE ===')
}
