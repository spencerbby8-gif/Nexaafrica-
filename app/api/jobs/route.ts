import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIIntelligenceWithQueueStatus } from '@/lib/ai/queries'
import { partitionVerifiedFirst } from '@/lib/ai/verified'
import type { JobFilters } from '@/lib/types'

const JOB_COLUMNS =
  'id, slug, title, company, company_logo, description_md, apply_url, category, location, country, salary_range, salary_min, salary_max, salary_currency, salary_period, employment_type, intelligence, tags, is_remote, is_open_to_africa, eligibility, posted_at, created_at, expires_at, trust_score, trust_confidence, trust_signals, trust_version, is_flagged, flagged_reason, source, source_id, evidence_state'

/**
 * GET /api/jobs
 * 
 * Cursor-based pagination for job listings.
 * 
 * Query params:
 * - cursor: ISO timestamp of last job's posted_at (for pagination)
 * - limit: Number of jobs to fetch (default: 20, max: 100)
 * - category: Filter by category slug
 * - country: Filter by country (ilike)
 * - remote: Filter remote-only jobs (1=true)
 * - africa: Filter open-to-Africa jobs (1=true)
 * - usd: Filter USD-paying jobs (1=true)
 * - employment_type: Filter by employment type
 * - q: Search query (title/company ilike)
 * 
 * Returns:
 * - jobs: Array of jobs with AI intelligence
 * - nextCursor: Cursor for next page (null if no more)
 * - hasMore: Boolean indicating if more jobs exist
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Parse filters
  const filters: JobFilters = {
    category: searchParams.get('category') || undefined,
    country: searchParams.get('country') || undefined,
    remoteOnly: searchParams.get('remote') === '1',
    openToAfrica: searchParams.get('africa') === '1',
    usdOnly: searchParams.get('usd') === '1',
    employmentType: (searchParams.get('employment_type') as any) || undefined,
    q: searchParams.get('q') || undefined,
  }
  
  // Parse pagination
  const cursor = searchParams.get('cursor')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100)
  
  try {
    const supabase = await createClient()

    // [REGION-LOCK] Never surface jobs the AI has judged Africa-restricted,
    // even when the ingest-time eligibility flag still says open. Matches the
    // getJobsWithAI behavior used by the server-rendered hubs.
    let aiRestrictedIds: string[] = []
    try {
      const { data: restricted } = await supabase
        .from('job_ai_intelligence')
        .select('job_id')
        .eq('africa_eligibility', 'restricted')
      aiRestrictedIds = (restricted || []).map((r: any) => r.job_id).filter(Boolean)
    } catch {}

    // Build query
    let query = supabase
      .from('jobs')
      .select(JOB_COLUMNS)
      .eq('is_active', true)
      // [PHASE-2] Remote board integrity: evidence-marked non-remote listings never surface.
      .neq('is_remote', false)
      .not('eligibility', 'eq', 'restricted')
      // [REGION-LOCK] Jobs not open to Africa never surface in pagination.
      .eq('is_open_to_africa', true)
      .order('posted_at', { ascending: false })
      .order('id', { ascending: false }) // Secondary sort to handle duplicate posted_at
      .limit(limit)

    if (aiRestrictedIds.length > 0) {
      query = query.not('id', 'in', `(${aiRestrictedIds.join(',')})`)
    }
    
    // Apply cursor (fetch jobs older than cursor)
    if (cursor) {
      // Parse cursor to get posted_at and id
      const [cursorPostedAt, cursorId] = cursor.split('|')
      
      if (cursorId) {
        // Use both posted_at and id for precise cursor pagination
        query = query.or(
          `posted_at.lt.${cursorPostedAt},and(posted_at.eq.${cursorPostedAt},id.lt.${cursorId})`
        )
      } else {
        // Fallback to posted_at only (backward compatibility)
        query = query.lt('posted_at', cursorPostedAt)
      }
    }
    
    // Apply filters
    if (filters.category) query = query.eq('category', filters.category)
    if (filters.country) query = query.ilike('country', filters.country)
    if (filters.remoteOnly) query = query.eq('is_remote', true)
    if (filters.openToAfrica) query = query.eq('is_open_to_africa', true)
    if (filters.usdOnly) {
      query = query.or('salary_range.ilike.%$%,salary_range.ilike.%USD%')
    }
    if (filters.employmentType) query = query.eq('employment_type', filters.employmentType)
    if (filters.q) {
      const term = `%${filters.q}%`
      query = query.or(`title.ilike.${term},company.ilike.${term}`)
    }
    
    const { data: jobs, error } = await query
    
    if (error) {
      console.error('[api/jobs] query error:', error.message)
      return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
      )
    }
    
    // Fetch AI intelligence for these jobs
    let jobsWithAI = jobs || []
    if (jobsWithAI.length > 0) {
      try {
        const { aiMap, queueStatus, queueError } = await getAIIntelligenceWithQueueStatus(
          jobsWithAI.map((j: any) => j.id)
        )
        jobsWithAI = jobsWithAI.map((j: any) => ({
          ...j,
          aiIntelligence: aiMap.get(j.id) || null,
          _queueStatus: queueStatus.get(j.id) || null,
          _queueError: queueError.get(j.id) ?? null,
        }))
      } catch (err) {
        console.error('[api/jobs] AI fetch error:', err)
        // Continue without AI data
      }
    }
    
    // [PHASE-2] Same verified-first semantics as the /jobs hub: each page
    // partitions its window with verified jobs first (canonical contract),
    // preserving DB order inside each tier. The cursor still walks the
    // deterministic (posted_at desc, id desc) base ordering, so pagination
    // is duplicate-free and total across pages.
    jobsWithAI = partitionVerifiedFirst(jobsWithAI as any) as typeof jobsWithAI

    // Determine if there are more jobs
    const hasMore = jobsWithAI.length === limit
    // Cursor anchors to the OLDEST row of the DB window (base ordering),
    // which the partition above may have moved — keeps boundaries exact.
    const lastWindowRow = (jobs || [])[(jobs || []).length - 1] as any
    const nextCursor = hasMore && lastWindowRow
      ? `${lastWindowRow.posted_at}|${lastWindowRow.id}`
      : null
    
    return NextResponse.json({
      jobs: jobsWithAI,
      nextCursor,
      hasMore,
    })
  } catch (error) {
    console.error('[api/jobs] unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
