/**
 * Dynamic Provider Registry
 * 
 * Updates provider configurations based on discovered and verified models.
 * Refreshes periodically to ensure Nexa always knows which models are available.
 */

import { PROVIDERS, type ProviderConfig, type ProviderId } from './types'
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
      
      // Find the best usable model
      const bestModel = catalogEntry.models
        .filter(m => m.usable)
        .sort((a, b) => (a.latencyMs || 9999) - (b.latencyMs || 9999))[0]
      
      if (!bestModel) {
        return { ...provider, enabled: false }
      }
      
      return {
        ...provider,
        model: bestModel.modelId,
        enabled: true,
        discoveredAt: catalogEntry.lastRefreshed,
        verifiedAt: bestModel.verifiedAt,
        usable: bestModel.usable,
        latencyMs: bestModel.latencyMs,
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
