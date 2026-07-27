import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IntelligenceOrchestrator } from '@/lib/intelligence/orchestrator'
import { withRateLimit, intelligenceRateLimiters } from '@/lib/rate-limit'

/**
 * POST /api/intelligence/batch
 * Analyze multiple jobs in batch
 */
async function batchHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { job_ids, concurrency = 5 } = body
    
    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return NextResponse.json(
        { error: 'job_ids array is required' },
        { status: 400 }
      )
    }
    
    if (job_ids.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 jobs per batch' },
        { status: 400 }
      )
    }
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 }
      )
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Fetch all jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .in('id', job_ids)
    
    if (jobsError || !jobs || jobs.length === 0) {
      return NextResponse.json(
        { error: 'No jobs found' },
        { status: 404 }
      )
    }
    
    // Run batch analysis
    const orchestrator = new IntelligenceOrchestrator()
    const results = await orchestrator.analyzeBatch(jobs, concurrency)
    
    // Calculate summary statistics
    const successCount = results.filter(r => r.success).length
    const avgTrustScore = results.reduce((sum, r) => sum + r.trust_score.score, 0) / results.length
    const avgIntelligenceScore = results.reduce((sum, r) => sum + r.intelligence_score.score, 0) / results.length
    
    const eligibilityBreakdown = {
      Explicit: results.filter(r => r.eligibility.level === 'Explicit').length,
      Likely: results.filter(r => r.eligibility.level === 'Likely').length,
      Unknown: results.filter(r => r.eligibility.level === 'Unknown').length,
      Restricted: results.filter(r => r.eligibility.level === 'Restricted').length,
    }
    
    return NextResponse.json({
      success: true,
      total_jobs: results.length,
      successful: successCount,
      failed: results.length - successCount,
      summary: {
        avg_trust_score: Math.round(avgTrustScore),
        avg_intelligence_score: Math.round(avgIntelligenceScore),
        eligibility_breakdown: eligibilityBreakdown,
      },
      results: results.map(r => ({
        job_id: r.job_id,
        success: r.success,
        trust_score: r.trust_score.score,
        trust_level: r.trust_score.level,
        eligibility: r.eligibility.level,
        eligibility_confidence: r.eligibility.confidence,
        intelligence_score: r.intelligence_score.score,
        intelligence_level: r.intelligence_score.level,
        evidence_count: r.evidence.length,
        errors: r.errors,
      })),
    })
  } catch (error: any) {
    console.error('Batch analysis failed:', error)
    return NextResponse.json(
      { error: error.message || 'Batch analysis failed' },
      { status: 500 }
    )
  }
}

// Export with rate limiting applied
export const POST = withRateLimit(batchHandler, intelligenceRateLimiters.batch)
