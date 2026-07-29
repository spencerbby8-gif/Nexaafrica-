import { NextResponse } from 'next/server'
import { discoverAllModels, getModelCatalog } from '@/lib/ai/model-discovery'
import { initializeModelRegistry, getAllModels, getEnabledModels, getRegistryStats, calculateRoutingPriorities } from '@/lib/ai/model-registry'
import { verifyAllModels } from '@/lib/ai/model-verification'
import { benchmarkAllModels } from '@/lib/ai/model-benchmark'
import { getRoutingStats } from '@/lib/ai/smart-router'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/ai/registry - Get model registry
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'stats'
    
    if (action === 'stats') {
      const stats = await getRegistryStats()
      return NextResponse.json(stats)
    }
    
    if (action === 'all') {
      const models = await getAllModels()
      return NextResponse.json({ models })
    }
    
    if (action === 'enabled') {
      const models = await getEnabledModels()
      return NextResponse.json({ models })
    }
    
    if (action === 'catalog') {
      const catalog = await getModelCatalog()
      return NextResponse.json({ catalog })
    }
    
    if (action === 'routing') {
      const stats = await getRoutingStats()
      return NextResponse.json(stats)
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/ai/registry - Trigger discovery, verification, benchmarking
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body.action || 'discover'
    
    if (action === 'discover') {
      console.log('[Registry API] Starting model discovery...')
      const catalogs = await discoverAllModels()
      
      // Initialize registry with discovered models
      const allModels = catalogs.flatMap(c => c.models)
      await initializeModelRegistry(allModels)
      
      return NextResponse.json({
        success: true,
        message: 'Discovery complete',
        totalProviders: catalogs.length,
        totalModels: allModels.length,
        catalogs: catalogs.map(c => ({
          provider: c.provider,
          totalModels: c.totalModels,
          discoveryError: c.discoveryError
        }))
      })
    }
    
    if (action === 'verify') {
      console.log('[Registry API] Starting model verification...')
      const catalog = await getModelCatalog()
      const allModels = catalog.flatMap(c => c.models)
      
      await verifyAllModels(allModels)
      
      return NextResponse.json({
        success: true,
        message: 'Verification complete',
        totalModels: allModels.length
      })
    }
    
    if (action === 'benchmark') {
      console.log('[Registry API] Starting model benchmarking...')
      const catalog = await getModelCatalog()
      const allModels = catalog.flatMap(c => c.models)
      
      await benchmarkAllModels(allModels)
      
      return NextResponse.json({
        success: true,
        message: 'Benchmarking complete',
        totalModels: allModels.length
      })
    }
    
    if (action === 'calculate-routing') {
      console.log('[Registry API] Calculating routing priorities...')
      await calculateRoutingPriorities()
      
      return NextResponse.json({
        success: true,
        message: 'Routing priorities calculated'
      })
    }
    
    if (action === 'full-pipeline') {
      console.log('[Registry API] Running full pipeline (discover → verify → benchmark → route)...')
      
      // Step 1: Discovery
      console.log('[Registry API] Step 1: Discovery...')
      const catalogs = await discoverAllModels()
      const allModels = catalogs.flatMap(c => c.models)
      
      // Step 2: Initialize registry
      console.log('[Registry API] Step 2: Initializing registry...')
      await initializeModelRegistry(allModels)
      
      // Step 3: Verification
      console.log('[Registry API] Step 3: Verification...')
      await verifyAllModels(allModels)
      
      // Step 4: Benchmarking
      console.log('[Registry API] Step 4: Benchmarking...')
      await benchmarkAllModels(allModels)
      
      // Step 5: Calculate routing
      console.log('[Registry API] Step 5: Calculating routing...')
      await calculateRoutingPriorities()
      
      // Get final stats
      const stats = await getRegistryStats()
      
      return NextResponse.json({
        success: true,
        message: 'Full pipeline complete',
        stats
      })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('[Registry API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
