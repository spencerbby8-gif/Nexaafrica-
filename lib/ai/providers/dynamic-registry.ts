/**
 * Dynamic Provider Registry
 * 
 * Updates provider configurations based on discovered and verified models.
 * Refreshes periodically to ensure Nexa always knows which models are available.
 */

import { PROVIDERS, MODEL_JSON_CAPABILITY, type ProviderConfig, type ProviderId } from './types'
import { getModelCatalog, type ProviderCatalog } from '../model-discovery'

const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
let lastRefresh = 0
let dynamicProviders: ProviderConfig[] = [...PROVIDERS]

/**
 * Refresh provider configurations from discovered models
 */
export async function refreshProviderRegistry(): Promise<ProviderConfig[]> {
  const now = Date.now()
  
  // Only refresh if enough time has passed
  if (now - lastRefresh < REFRESH_INTERVAL_MS) {
    return dynamicProviders
  }
  
  try {
    const catalog = await getModelCatalog()
    
    if (catalog.length === 0) {
      console.log('No model catalog available, using static providers')
      return dynamicProviders
    }
    
    // Update providers with discovered models
    dynamicProviders = PROVIDERS.map(provider => {
      const catalogEntry = catalog.find(c => c.provider === provider.id)
      
      if (!catalogEntry || catalogEntry.models.length === 0) {
        return provider
      }
      
      // Find the best usable model.
      // P4: prefer measured production ACCURACY (benchmarks.overallScore,
      // written by the live quality audit) over raw probe latency.
      // Models with no benchmark data fall back to latency ordering, so
      // accuracy can only improve selection, never starve it.
      // [V2.1] JSON-capability guard: models KNOWN to return unusable
      // structured output (MODEL_JSON_CAPABILITY === false, measured in
      // production + official docs) are selected only when every usable
      // alternative is also JSON-incapable. This keeps e.g. cloudflare on
      // llama-3.3-70b (function-calling per official docs) instead of
      // gemma-2b-it-lora, whose 2B LoRA outputs failed JSON parsing in
      // 37/40 production calls (2026-08-11).
      const usablePool = catalogEntry.models.filter(m => m.health.usable)
      const benchmarked = usablePool.filter((m: any) => typeof m.benchmarks?.overallScore === 'number')
      const pool = benchmarked.length > 0 ? benchmarked : usablePool
      const bestModel = [...pool].sort((a: any, b: any) => {
        const aBanned = MODEL_JSON_CAPABILITY[a.modelId] === false ? 1 : 0
        const bBanned = MODEL_JSON_CAPABILITY[b.modelId] === false ? 1 : 0
        if (aBanned !== bBanned) return aBanned - bBanned
        if (benchmarked.length > 0) {
          const aB = a.benchmarks?.overallScore ?? 0
          const bB = b.benchmarks?.overallScore ?? 0
          if (aB !== bB) return bB - aB
        }
        return (a.health.avgLatencyMs || 9999) - (b.health.avgLatencyMs || 9999)
      })[0]
      
      if (!bestModel) {
        return { ...provider, enabled: false }
      }
      
      return {
        ...provider,
        model: bestModel.modelId,
        enabled: true,
        discoveredAt: catalogEntry.discoveredAt,
        verifiedAt: bestModel.health.lastVerifiedAt,
        usable: bestModel.health.usable,
        latencyMs: bestModel.health.avgLatencyMs,
        capabilities: bestModel.capabilities
      }
    })
    
    lastRefresh = now
    
    console.log(`Provider registry refreshed: ${dynamicProviders.filter(p => p.enabled).length}/${dynamicProviders.length} providers enabled`)
    
    return dynamicProviders
  } catch (error: any) {
    console.error('Failed to refresh provider registry:', error.message)
    return dynamicProviders
  }
}

/**
 * Get current provider configurations
 */
export function getProviders(): ProviderConfig[] {
  return dynamicProviders
}

/**
 * Get enabled providers sorted by priority
 */
export function getEnabledProviders(): ProviderConfig[] {
  return dynamicProviders
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Get provider by ID
 */
export function getProvider(id: ProviderId): ProviderConfig | undefined {
  return dynamicProviders.find(p => p.id === id)
}

/** TEST-ONLY: inject provider configs (deterministic routing tests). */
export function setProvidersForTesting(cfgs: ProviderConfig[]): void {
  dynamicProviders = cfgs
}

/**
 * Manually trigger a refresh
 */
export async function forceRefresh(): Promise<ProviderConfig[]> {
  lastRefresh = 0
  return refreshProviderRegistry()
}

/**
 * Get registry status
 */
export function getRegistryStatus() {
  return {
    totalProviders: dynamicProviders.length,
    enabledProviders: dynamicProviders.filter(p => p.enabled).length,
    lastRefresh: new Date(lastRefresh).toISOString(),
    nextRefresh: new Date(lastRefresh + REFRESH_INTERVAL_MS).toISOString(),
    providers: dynamicProviders.map(p => ({
      id: p.id,
      name: p.name,
      model: p.model,
      enabled: p.enabled,
      priority: p.priority,
      discoveredAt: p.discoveredAt,
      verifiedAt: p.verifiedAt,
      usable: p.usable,
      latencyMs: p.latencyMs
    }))
  }
}
