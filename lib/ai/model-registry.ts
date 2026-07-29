/**
 * Per-Model Registry
 * 
 * Tracks every discovered model individually with:
 * - Health metrics (health score, success rate, failure rate, latency)
 * - Capability flags (detected via live tests)
 * - Benchmark results (Nexa-specific tasks)
 * - Quota status and cooldown state
 * - Routing priority (calculated dynamically)
 */

import { createClient } from '@supabase/supabase-js'
import type { DiscoveredModel } from './model-discovery'

export interface ModelRecord {
  provider: string
  modelId: string
  modelName: string
  discoveredAt: string
  discoveryEndpoint: string
  
  // Capabilities (detected via live tests)
  capabilities: {
    chat: boolean
    reasoning: boolean
    coding: boolean
    vision: boolean
    functionCalling: boolean
    structuredJSON: boolean
    embeddings: boolean
    longContext: boolean
    maxTokens: number
    contextLength: number
  }
  
  // Health metrics (updated via live verification)
  health: {
    verified: boolean
    usable: boolean
    healthScore: number  // 0-100
    successRate: number  // 0-100
    failureRate: number  // 0-100
    avgLatencyMs: number
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    lastVerifiedAt?: string
    lastSuccessfulAt?: string
    lastFailedAt?: string
    quotaStatus: 'ok' | 'warning' | 'exhausted'
    quotaRemaining?: number
    cooldownUntil?: string
    consecutiveFailures: number
  }
  
  // Benchmark results (Nexa-specific tasks)
  benchmarks: {
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
  enabled: boolean
  
  // Cost
  cost?: {
    inputPer1kTokens?: number
    outputPer1kTokens?: number
  }
  
  // Metadata
  lastUpdatedAt: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Initialize model registry from discovered models
 */
export async function initializeModelRegistry(discoveredModels: DiscoveredModel[]): Promise<ModelRecord[]> {
  const records: ModelRecord[] = []
  
  for (const model of discoveredModels) {
    const record: ModelRecord = {
      provider: model.provider,
      modelId: model.modelId,
      modelName: model.modelName,
      discoveredAt: model.discoveredAt,
      discoveryEndpoint: model.discoveryEndpoint,
      
      capabilities: {
        chat: model.capabilities.chat || false,
        reasoning: model.capabilities.reasoning || false,
        coding: model.capabilities.coding || false,
        vision: model.capabilities.vision || false,
        functionCalling: model.capabilities.functionCalling || false,
        structuredJSON: model.capabilities.structuredJSON || false,
        embeddings: model.capabilities.embeddings || false,
        longContext: model.capabilities.longContext || false,
        maxTokens: model.capabilities.maxTokens || 0,
        contextLength: model.capabilities.contextLength || 0
      },
      
      health: {
        verified: model.health.verified,
        usable: model.health.usable,
        healthScore: model.health.healthScore,
        successRate: model.health.successRate,
        failureRate: model.health.failureRate,
        avgLatencyMs: model.health.avgLatencyMs,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        lastVerifiedAt: model.health.lastVerifiedAt,
        lastSuccessfulAt: model.health.lastSuccessfulAt,
        quotaStatus: model.health.quotaStatus,
        cooldownUntil: model.health.cooldownUntil,
        consecutiveFailures: 0
      },
      
      benchmarks: {
        lastBenchmarkAt: model.benchmarks?.lastBenchmarkAt
      },
      
      routingPriority: 0,  // Will be calculated after benchmarks
      enabled: model.health.usable,
      
      cost: model.cost,
      
      lastUpdatedAt: new Date().toISOString()
    }
    
    records.push(record)
  }
  
  // Cache in database
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    for (const record of records) {
      await supabase
        .from('ai_model_registry')
        .upsert({
          provider: record.provider,
          model_id: record.modelId,
          model_name: record.modelName,
          discovered_at: record.discoveredAt,
          discovery_endpoint: record.discoveryEndpoint,
          capabilities: record.capabilities,
          health: record.health,
          benchmarks: record.benchmarks,
          routing_priority: record.routingPriority,
          enabled: record.enabled,
          cost: record.cost,
          last_updated_at: record.lastUpdatedAt
        }, { onConflict: 'provider,model_id' })
    }
  } catch (error: any) {
    console.error('[Registry] Failed to cache model records:', error.message)
  }
  
  return records
}

/**
 * Get all models from registry
 */
export async function getAllModels(): Promise<ModelRecord[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase
      .from('ai_model_registry')
      .select('*')
      .order('routing_priority', { ascending: false })
    
    if (error) {
      console.error('[Registry] Failed to fetch models:', error.message)
      return []
    }
    
    return (data || []).map((row: any) => ({
      provider: row.provider,
      modelId: row.model_id,
      modelName: row.model_name,
      discoveredAt: row.discovered_at,
      discoveryEndpoint: row.discovery_endpoint,
      capabilities: row.capabilities,
      health: row.health,
      benchmarks: row.benchmarks,
      routingPriority: row.routing_priority,
      enabled: row.enabled,
      cost: row.cost,
      lastUpdatedAt: row.last_updated_at
    }))
  } catch (error: any) {
    console.error('[Registry] Failed to fetch models:', error.message)
    return []
  }
}

/**
 * Get enabled models sorted by routing priority
 */
export async function getEnabledModels(): Promise<ModelRecord[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase
      .from('ai_model_registry')
      .select('*')
      .eq('enabled', true)
      .order('routing_priority', { ascending: false })
    
    if (error) {
      console.error('[Registry] Failed to fetch enabled models:', error.message)
      return []
    }
    
    return (data || []).map((row: any) => ({
      provider: row.provider,
      modelId: row.model_id,
      modelName: row.model_name,
      discoveredAt: row.discovered_at,
      discoveryEndpoint: row.discovery_endpoint,
      capabilities: row.capabilities,
      health: row.health,
      benchmarks: row.benchmarks,
      routingPriority: row.routing_priority,
      enabled: row.enabled,
      cost: row.cost,
      lastUpdatedAt: row.last_updated_at
    }))
  } catch (error: any) {
    console.error('[Registry] Failed to fetch enabled models:', error.message)
    return []
  }
}

/**
 * Get specific model
 */
export async function getModel(provider: string, modelId: string): Promise<ModelRecord | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase
      .from('ai_model_registry')
      .select('*')
      .eq('provider', provider)
      .eq('model_id', modelId)
      .single()
    
    if (error) {
      console.error(`[Registry] Failed to fetch model ${provider}/${modelId}:`, error.message)
      return null
    }
    
    if (!data) return null
    
    return {
      provider: data.provider,
      modelId: data.model_id,
      modelName: data.model_name,
      discoveredAt: data.discovered_at,
      discoveryEndpoint: data.discovery_endpoint,
      capabilities: data.capabilities,
      health: data.health,
      benchmarks: data.benchmarks,
      routingPriority: data.routing_priority,
      enabled: data.enabled,
      cost: data.cost,
      lastUpdatedAt: data.last_updated_at
    }
  } catch (error: any) {
    console.error(`[Registry] Failed to fetch model ${provider}/${modelId}:`, error.message)
    return null
  }
}

/**
 * Update model health after inference
 */
export async function updateModelHealth(
  provider: string,
  modelId: string,
  success: boolean,
  latencyMs: number,
  quotaExhausted?: boolean,
  rateLimited?: boolean
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Get current model
    const model = await getModel(provider, modelId)
    if (!model) return
    
    // Update health metrics
    const now = new Date().toISOString()
    const health = { ...model.health }
    
    health.totalRequests++
    if (success) {
      health.successfulRequests++
      health.lastSuccessfulAt = now
      health.consecutiveFailures = 0
    } else {
      health.failedRequests++
      health.lastFailedAt = now
      health.consecutiveFailures++
      
      // Cooldown on consecutive failures
      if (health.consecutiveFailures >= 3) {
        const cooldownMinutes = Math.min(60, Math.pow(2, health.consecutiveFailures))
        health.cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString()
      }
    }
    
    // Update rates
    health.successRate = health.totalRequests > 0 
      ? (health.successfulRequests / health.totalRequests) * 100 
      : 0
    health.failureRate = 100 - health.successRate
    
    // Update latency (exponential moving average)
    if (success) {
      health.avgLatencyMs = health.avgLatencyMs > 0
        ? Math.round(health.avgLatencyMs * 0.7 + latencyMs * 0.3)
        : latencyMs
    }
    
    // Update quota status
    if (quotaExhausted) {
      health.quotaStatus = 'exhausted'
      health.cooldownUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString()  // 1 hour
    } else if (rateLimited) {
      health.quotaStatus = 'warning'
      health.cooldownUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString()  // 5 minutes
    } else if (health.quotaStatus !== 'ok') {
      // Check if cooldown has expired
      if (health.cooldownUntil && new Date(health.cooldownUntil) < new Date()) {
        health.quotaStatus = 'ok'
        health.cooldownUntil = undefined
      }
    }
    
    // Update verified status
    health.verified = true
    health.lastVerifiedAt = now
    
    // Update usable status
    health.usable = health.quotaStatus !== 'exhausted' && 
                    (!health.cooldownUntil || new Date(health.cooldownUntil) < new Date())
    
    // Calculate health score
    health.healthScore = Math.round(
      health.successRate * 0.5 +
      (100 - Math.min(100, health.avgLatencyMs / 50)) * 0.3 +
      (health.quotaStatus === 'ok' ? 100 : health.quotaStatus === 'warning' ? 50 : 0) * 0.2
    )
    
    // Update in database
    await supabase
      .from('ai_model_registry')
      .update({
        health,
        last_updated_at: now
      })
      .eq('provider', provider)
      .eq('model_id', modelId)
    
  } catch (error: any) {
    console.error(`[Registry] Failed to update model health ${provider}/${modelId}:`, error.message)
  }
}

/**
 * Update model benchmarks
 */
export async function updateModelBenchmarks(
  provider: string,
  modelId: string,
  benchmarks: Partial<ModelRecord['benchmarks']>
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Get current model
    const model = await getModel(provider, modelId)
    if (!model) return
    
    // Update benchmarks
    const now = new Date().toISOString()
    const updatedBenchmarks = { ...model.benchmarks, ...benchmarks, lastBenchmarkAt: now }
    
    // Calculate overall score
    const scores = Object.values(updatedBenchmarks).filter(v => typeof v === 'number') as number[]
    if (scores.length > 0) {
      updatedBenchmarks.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    }
    
    // Update in database
    await supabase
      .from('ai_model_registry')
      .update({
        benchmarks: updatedBenchmarks,
        last_updated_at: now
      })
      .eq('provider', provider)
      .eq('model_id', modelId)
    
  } catch (error: any) {
    console.error(`[Registry] Failed to update model benchmarks ${provider}/${modelId}:`, error.message)
  }
}

/**
 * Update model capabilities
 */
export async function updateModelCapabilities(
  provider: string,
  modelId: string,
  capabilities: Partial<ModelRecord['capabilities']>
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Get current model
    const model = await getModel(provider, modelId)
    if (!model) return
    
    // Update capabilities
    const now = new Date().toISOString()
    const updatedCapabilities = { ...model.capabilities, ...capabilities }
    
    // Update in database
    await supabase
      .from('ai_model_registry')
      .update({
        capabilities: updatedCapabilities,
        last_updated_at: now
      })
      .eq('provider', provider)
      .eq('model_id', modelId)
    
  } catch (error: any) {
    console.error(`[Registry] Failed to update model capabilities ${provider}/${modelId}:`, error.message)
  }
}

/**
 * Calculate routing priority for all models
 */
export async function calculateRoutingPriorities(): Promise<void> {
  try {
    const models = await getAllModels()
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Sort models by: benchmark score, health score, latency, cost
    const sorted = models
      .filter(m => m.enabled && m.health.usable)
      .sort((a, b) => {
        // Benchmark score (40% weight)
        const benchmarkA = a.benchmarks.overallScore || 0
        const benchmarkB = b.benchmarks.overallScore || 0
        const benchmarkDiff = benchmarkB - benchmarkA
        
        if (Math.abs(benchmarkDiff) > 5) return benchmarkDiff
        
        // Health score (30% weight)
        const healthDiff = b.health.healthScore - a.health.healthScore
        if (Math.abs(healthDiff) > 5) return healthDiff
        
        // Latency (20% weight, lower is better)
        const latencyDiff = a.health.avgLatencyMs - b.health.avgLatencyMs
        if (Math.abs(latencyDiff) > 100) return latencyDiff
        
        // Cost (10% weight, lower is better)
        const costA = (a.cost?.inputPer1kTokens || 0) + (a.cost?.outputPer1kTokens || 0)
        const costB = (b.cost?.inputPer1kTokens || 0) + (b.cost?.outputPer1kTokens || 0)
        return costA - costB
      })
    
    // Assign priorities
    for (let i = 0; i < sorted.length; i++) {
      const model = sorted[i]
      await supabase
        .from('ai_model_registry')
        .update({
          routing_priority: sorted.length - i,  // Higher priority = higher number
          last_updated_at: new Date().toISOString()
        })
        .eq('provider', model.provider)
        .eq('model_id', model.modelId)
    }
    
  } catch (error: any) {
    console.error('[Registry] Failed to calculate routing priorities:', error.message)
  }
}

/**
 * Get registry statistics
 */
export async function getRegistryStats() {
  const models = await getAllModels()
  
  return {
    totalModels: models.length,
    enabledModels: models.filter(m => m.enabled).length,
    usableModels: models.filter(m => m.health.usable).length,
    verifiedModels: models.filter(m => m.health.verified).length,
    benchmarkedModels: models.filter(m => m.benchmarks.overallScore !== undefined).length,
    avgHealthScore: models.length > 0
      ? Math.round(models.reduce((sum, m) => sum + m.health.healthScore, 0) / models.length)
      : 0,
    avgSuccessRate: models.length > 0
      ? Math.round(models.reduce((sum, m) => sum + m.health.successRate, 0) / models.length)
      : 0,
    avgLatency: models.length > 0
      ? Math.round(models.reduce((sum, m) => sum + m.health.avgLatencyMs, 0) / models.length)
      : 0,
    byProvider: models.reduce((acc, m) => {
      if (!acc[m.provider]) {
        acc[m.provider] = { total: 0, enabled: 0, usable: 0 }
      }
      acc[m.provider].total++
      if (m.enabled) acc[m.provider].enabled++
      if (m.health.usable) acc[m.provider].usable++
      return acc
    }, {} as Record<string, { total: number; enabled: number; usable: number }>)
  }
}
