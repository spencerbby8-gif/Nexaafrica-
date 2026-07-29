import { NextRequest, NextResponse } from 'next/server'
import { getModelCatalog } from '@/lib/ai/model-discovery'
import { isPipelineAuthorized } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Discover and verify AI models from all providers
 * 
 * GET /api/models/discover - Get cached catalog
 * POST /api/models/discover - Trigger discovery and verification
 */
export async function GET(request: NextRequest) {
  if (!isPipelineAuthorized(request as unknown as Request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const catalog = await getModelCatalog()
    return NextResponse.json({ catalog })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!isPipelineAuthorized(request as unknown as Request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Full truth sync: discover + verify with real inference + persist + refresh registry
    const { syncLiveModelRegistry } = await import('@/lib/ai/model-sync')
    const modelSync = await syncLiveModelRegistry({ force: true, budgetMs: 80_000 })
    const catalog = await getModelCatalog()
    
    const summary = catalog.map(c => ({
      provider: c.provider,
      totalModels: c.totalModels,
      verifiedModels: c.verifiedModels,
      usableModels: c.usableModels
    }))
    
    return NextResponse.json({
      success: true,
      catalog: summary,
      totalProviders: catalog.length,
      totalModels: catalog.reduce((sum, c) => sum + c.totalModels, 0),
      verifiedModels: catalog.reduce((sum, c) => sum + c.verifiedModels, 0),
      usableModels: catalog.reduce((sum, c) => sum + c.usableModels, 0)
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
