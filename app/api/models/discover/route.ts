import { NextRequest, NextResponse } from 'next/server'
import { discoverAllModels, getModelCatalog } from '@/lib/ai/model-discovery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Discover and verify AI models from all providers
 * 
 * GET /api/models/discover - Get cached catalog
 * POST /api/models/discover - Trigger discovery and verification
 */
export async function GET() {
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
  try {
    const catalog = await discoverAllModels()
    
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
