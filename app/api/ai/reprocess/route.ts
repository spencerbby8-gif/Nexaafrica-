import { NextResponse } from 'next/server'
import { isPipelineAuthorized } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { processAIQueue } from '@/lib/ai/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/ai/reprocess
 * 
 * Resets N jobs back to "pending" in the AI queue and reprocesses them
 * through the truthful intelligence pipeline.
 * 
 * Query params:
 * - count: Number of jobs to reprocess (default 20, max 200)
 * - mode: "completed" (reprocess completed) or "failed" (retry failed) or "all"
 * 
 * Returns before/after snapshots for auditing truthfulness.
 */
export async function POST(req: Request) {
  if (!isPipelineAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const count = Math.max(1, Math.min(200, Number(url.searchParams.get('count')) || 20))
  const mode = url.searchParams.get('mode') || 'completed'

  const supabase = createServiceClient()

  // Get BEFORE snapshots of intelligence for these jobs
  let statusFilter = 'completed'
  if (mode === 'failed') statusFilter = 'failed'
  else if (mode === 'all') statusFilter = ''

  let queueQuery = supabase
    .from('ai_processing_queue')
    .select('id, job_id, status, attempts')
    .order('completed_at', { ascending: false })
    .limit(count)
  
  if (statusFilter) {
    queueQuery = queueQuery.eq('status', statusFilter)
  }

  const { data: queueItems, error: queueError } = await queueQuery
  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 })
  }

  if (!queueItems || queueItems.length === 0) {
    return NextResponse.json({ ok: true, message: 'No jobs to reprocess', count: 0 })
  }

  const jobIds = queueItems.map(q => q.job_id)

  // Capture BEFORE intelligence
  const { data: beforeIntelligence } = await supabase
    .from('job_ai_intelligence')
    .select('job_id, model_version, africa_eligibility, africa_confidence, salary_min, salary_max, salary_evidence, salary_confidence, remote_eligibility, remote_confidence, company_legitimacy, company_confidence, company_evidence, experience_level, experience_confidence, required_skills, job_quality, job_quality_confidence, overall_confidence')
    .in('job_id', jobIds)

  const beforeMap = new Map<string, any>()
  for (const row of (beforeIntelligence || [])) {
    beforeMap.set(row.job_id, row)
  }

  // Reset queue items to pending with attempts=0
  const queueIds = queueItems.map(q => q.id)
  await supabase
    .from('ai_processing_queue')
    .update({ status: 'pending', attempts: 0, error: null, started_at: null, completed_at: null })
    .in('id', queueIds)

  // Process the queue (this runs the truthful pipeline)
  const processStart = Date.now()
  const result = await processAIQueue(Math.min(count, 50))
  const processElapsed = Date.now() - processStart

  // Capture AFTER intelligence
  const { data: afterIntelligence } = await supabase
    .from('job_ai_intelligence')
    .select('job_id, model_version, africa_eligibility, africa_confidence, salary_min, salary_max, salary_evidence, salary_confidence, remote_eligibility, remote_confidence, company_legitimacy, company_confidence, company_evidence, experience_level, experience_confidence, required_skills, job_quality, job_quality_confidence, overall_confidence')
    .in('job_id', jobIds)

  const afterMap = new Map<string, any>()
  for (const row of (afterIntelligence || [])) {
    afterMap.set(row.job_id, row)
  }

  // Get job details for context
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, company, salary_range, apply_url, source')
    .in('id', jobIds)

  const jobMap = new Map<string, any>()
  for (const j of (jobs || [])) {
    jobMap.set(j.id, j)
  }

  // Build comparison
  const comparisons = jobIds.map(jid => {
    const before = beforeMap.get(jid) || {}
    const after = afterMap.get(jid) || {}
    const job = jobMap.get(jid) || {}
    
    const changes: string[] = []
    if (before.model_version !== after.model_version) changes.push(`model: ${before.model_version} → ${after.model_version}`)
    if (before.africa_eligibility !== after.africa_eligibility) changes.push(`africa: ${before.africa_eligibility} → ${after.africa_eligibility}`)
    if (before.africa_confidence !== after.africa_confidence) changes.push(`africa_conf: ${before.africa_confidence} → ${after.africa_confidence}`)
    if (before.salary_min !== after.salary_min || before.salary_max !== after.salary_max) changes.push(`salary: ${before.salary_min}-${before.salary_max} → ${after.salary_min}-${after.salary_max}`)
    if (before.salary_confidence !== after.salary_confidence) changes.push(`salary_conf: ${before.salary_confidence} → ${after.salary_confidence}`)
    if (before.remote_eligibility !== after.remote_eligibility) changes.push(`remote: ${before.remote_eligibility} → ${after.remote_eligibility}`)
    if (before.company_legitimacy !== after.company_legitimacy) changes.push(`company: ${before.company_legitimacy} → ${after.company_legitimacy}`)
    if (before.company_confidence !== after.company_confidence) changes.push(`company_conf: ${before.company_confidence} → ${after.company_confidence}`)
    if (before.overall_confidence !== after.overall_confidence) changes.push(`overall: ${before.overall_confidence} → ${after.overall_confidence}`)

    return {
      job_id: jid.slice(0, 8),
      title: job.title?.slice(0, 60),
      company: job.company,
      source: job.source,
      salary_range: job.salary_range,
      before: {
        model: before.model_version,
        africa: before.africa_eligibility,
        africa_conf: before.africa_confidence,
        salary: `${before.salary_min || 'null'}-${before.salary_max || 'null'}`,
        salary_conf: before.salary_confidence,
        salary_evidence: before.salary_evidence?.slice(0, 80),
        remote: before.remote_eligibility,
        remote_conf: before.remote_confidence,
        company: before.company_legitimacy,
        company_conf: before.company_confidence,
        company_evidence: before.company_evidence?.slice(0, 80),
        experience: before.experience_level,
        quality: before.job_quality,
        quality_conf: before.job_quality_confidence,
        overall: before.overall_confidence,
      },
      after: {
        model: after.model_version,
        africa: after.africa_eligibility,
        africa_conf: after.africa_confidence,
        salary: `${after.salary_min || 'null'}-${after.salary_max || 'null'}`,
        salary_conf: after.salary_confidence,
        salary_evidence: after.salary_evidence?.slice(0, 80),
        remote: after.remote_eligibility,
        remote_conf: after.remote_confidence,
        company: after.company_legitimacy,
        company_conf: after.company_confidence,
        company_evidence: after.company_evidence?.slice(0, 80),
        experience: after.experience_level,
        quality: after.job_quality,
        quality_conf: after.job_quality_confidence,
        overall: after.overall_confidence,
      },
      changes: changes.length > 0 ? changes : ['no changes'],
    }
  })

  // Summary stats
  const uniqueModels = new Set(comparisons.map(c => c.after.model).filter(Boolean))
  const confidenceChanges = comparisons.filter(c => c.changes.some(ch => ch.includes('conf')))

  return NextResponse.json({
    ok: true,
    reprocessed: queueItems.length,
    processed: result.processed,
    failed: result.failed,
    elapsedMs: processElapsed,
    summary: {
      uniqueModelsUsed: Array.from(uniqueModels),
      jobsWithChanges: comparisons.filter(c => c.changes[0] !== 'no changes').length,
      confidenceChanged: confidenceChanges.length,
      totalJobs: comparisons.length,
    },
    comparisons: comparisons.slice(0, 20), // First 20 for readability
  })
}

export const GET = POST
