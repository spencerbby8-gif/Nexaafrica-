import { NextResponse } from 'next/server'
import { processAIQueue } from '@/lib/ai/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Test endpoint to manually trigger queue processing
 * WARNING: This endpoint has NO authentication - only for testing!
 * Remove after verification.
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const batch = Math.max(1, Math.min(10, Number(url.searchParams.get('batch')) || 3))

  console.log(`[TEST] Manually triggering queue processing with batch size: ${batch}`)

  const started = Date.now()
  
  try {
    const result = await processAIQueue(batch)
    const elapsedMs = Date.now() - started

    console.log(`[TEST] Queue processing completed in ${elapsedMs}ms`)
    console.log(`[TEST] Result:`, JSON.stringify(result, null, 2))

    return NextResponse.json({ 
      ok: true, 
      elapsedMs, 
      ...result,
      message: 'Queue processing completed. Check ai_provider_log for second opinion entries.'
    }, { status: 200 })
  } catch (error) {
    console.error(`[TEST] Queue processing failed:`, error)
    return NextResponse.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export const GET = POST
