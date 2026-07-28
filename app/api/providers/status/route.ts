import { NextResponse } from 'next/server'
import { getRegistryStatus, forceRefresh } from '@/lib/ai/providers/dynamic-registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Get provider registry status
 * 
 * GET /api/providers/status - Get current status
 * POST /api/providers/status - Force refresh
 */
export async function GET() {
  try {
    const status = getRegistryStatus()
    return NextResponse.json(status)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    await forceRefresh()
    const status = getRegistryStatus()
    return NextResponse.json({
      success: true,
      message: 'Provider registry refreshed',
      status
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
