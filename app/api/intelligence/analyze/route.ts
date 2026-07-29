import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { IntelligenceOrchestrator } from '@/lib/intelligence/orchestrator'
import { withRateLimit, intelligenceRateLimiters } from '@/lib/rate-limit'

/**
 * POST /api/intelligence/analyze
 * Analyze a job and generate intelligence scores
 */
async function analyzeHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { job_id } = body
    
    if (!job_id) {
      return NextResponse.json(
        { error: 'job_id is required' },
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
    
    // Fetch job from database
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .single()
    
    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }
    
    // Run intelligence analysis
    const orchestrator = new IntelligenceOrchestrator()
    const result = await orchestrator.analyze(job)
    
    return NextResponse.json({
      success: result.success,
      job_id: result.job_id,
      evidence_count: result.evidence.length,
      trust_score: result.trust_score,
      eligibility: result.eligibility,
      intelligence_score: result.intelligence_score,
      errors: result.errors,
    })
  } catch (error: any) {
    console.error('Intelligence analysis failed:', error)
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    )
  }
}

// Export with rate limiting applied
export const POST = withRateLimit(analyzeHandler, intelligenceRateLimiters.analyze)

/**
 * GET /api/intelligence/analyze
 * Get existing intelligence for a job
 */
async function getHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('job_id')
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'job_id is required' },
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
    
    // Fetch intelligence scores
    const { data: scores, error: scoresError } = await supabase
      .from('job_scores')
      .select('*')
      .eq('job_id', jobId)
      .single()
    
    if (scoresError || !scores) {
      return NextResponse.json(
        { error: 'Intelligence not found. Run POST to analyze.' },
        { status: 404 }
      )
    }
    
    // Fetch evidence
    const { data: evidence, error: evidenceError } = await supabase
      .from('job_evidence')
      .select('*')
      .eq('job_id', jobId)
      .order('collected_at', { ascending: false })
    
    return NextResponse.json({
      job_id: jobId,
      scores,
      evidence: evidence || [],
    })
  } catch (error: any) {
    console.error('Failed to fetch intelligence:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch intelligence' },
      { status: 500 }
    )
  }
}

// Export with rate limiting applied
export const GET = withRateLimit(getHandler, intelligenceRateLimiters.get)
