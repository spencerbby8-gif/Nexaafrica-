import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { warmHealthFromDB } from '@/lib/ai/orchestrator'
import { getOrchHealth } from '@/lib/ai/orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return true // allow in dev if no token set
  return req.headers.get('authorization') === `Bearer ${token}`
}

export async function GET(req: Request) {
  await warmHealthFromDB()  // restore health from DB before reporting
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  // Coverage metrics
  const [
    jobsActive,
    queueTotal,
    queuePending,
    queueCompleted,
    queueFailed,
    queueProcessing,
    aiTotal,
    aiAfricaExplicit,
    aiAfricaLikely,
    aiAfricaRestricted,
    aiAfricaUnknown,
    aiRemoteFull,
    aiRemoteUnknown,
    aiSalaryDisclosed,
    aiSalaryUndisclosed,
    aiSalaryWithMin,
    aiCompanyVerified,
    aiCompanyUnknown,
    aiExpUnknown,
    jobsWithSalaryRange,
    jobsRawHtml,
  ] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('ai_processing_queue').select('id', { count: 'exact', head: true }),
    supabase.from('ai_processing_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('ai_processing_queue').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('ai_processing_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('ai_processing_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('africa_eligibility', 'explicit'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('africa_eligibility', 'likely'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('africa_eligibility', 'restricted'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('africa_eligibility', 'unknown'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('remote_eligibility', 'fully_remote'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('remote_eligibility', 'unknown'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('salary_transparency', 'disclosed'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('salary_transparency', 'undisclosed'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).not('salary_min', 'is', null),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('company_legitimacy', 'verified'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('company_legitimacy', 'unknown'),
    supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).eq('experience_level', 'unknown'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true).not('salary_range', 'is', null),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true).ilike('description_md', '%&lt;div%'),
  ])

  const totalJobs = jobsActive.count || 0
  const totalAI = aiTotal.count || 0
  const coverage = totalJobs ? Math.round((totalAI / totalJobs) * 100) : 0
  const queueCov = queueTotal.count ? Math.round(((queueCompleted.count || 0) / queueTotal.count) * 100) : 0
  const salaryCoverage = totalAI ? Math.round(((aiSalaryDisclosed.count || 0) / totalAI) * 100) : 0

  // Provider health - in-memory, best effort
  let providerHealth: any[] = []
  try {
    const { getAllProviderHealth } = await import('@/lib/ai/providers/manager')
    providerHealth = getAllProviderHealth()
  } catch {}
  let orchHealth: any[] = []
  try { orchHealth = getOrchHealth() } catch {}

  // Rendering coverage check – sample recent jobs and see if they have AI
  const { data: recentJobs } = await supabase.from('jobs').select('id, slug').eq('is_active', true).order('posted_at', { ascending: false }).limit(20)
  const recentIds = (recentJobs || []).map((j: any) => j.id)
  let recentWithAI = 0
  if (recentIds.length > 0) {
    const { count } = await supabase.from('job_ai_intelligence').select('id', { count: 'exact', head: true }).in('job_id', recentIds)
    recentWithAI = count || 0
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    coverage: {
      jobsActive: totalJobs,
      aiTotal,
      aiCoveragePercent: coverage,
      queueTotal: queueTotal.count,
      queuePending: queuePending.count,
      queueCompleted: queueCompleted.count,
      queueFailed: queueFailed.count,
      queueProcessing: queueProcessing.count,
      queueCoveragePercent: queueCov,
      recentJobsChecked: recentIds.length,
      recentWithAICount: recentWithAI,
      recentWithAIPercent: recentIds.length ? Math.round((recentWithAI / recentIds.length) * 100) : 0,
    },
    salary: {
      jobsWithSalaryRange: jobsWithSalaryRange.count,
      aiWithSalaryMin: aiSalaryWithMin.count,
      aiSalaryDisclosed: aiSalaryDisclosed.count,
      aiSalaryUndisclosed: aiSalaryUndisclosed.count,
      salaryCoveragePercent: salaryCoverage,
      jobsRawHtmlLeak: jobsRawHtml.count,
    },
    africa: {
      explicit: aiAfricaExplicit.count,
      likely: aiAfricaLikely.count,
      restricted: aiAfricaRestricted.count,
      unknown: aiAfricaUnknown.count,
    },
    remote: {
      fullyRemote: aiRemoteFull.count,
      unknown: aiRemoteUnknown.count,
    },
    company: {
      verified: aiCompanyVerified.count,
      unknown: aiCompanyUnknown.count,
    },
    experience: {
      unknown: aiExpUnknown.count,
    },
    providerHealth,
    orchHealth,
    checks: {
      queuePopulating: (queueTotal.count || 0) >= totalJobs * 0.9,
      aiRowCoverageHigh: coverage >= 80,
      salaryRenderingOk: (jobsWithSalaryRange.count || 0) > 0 ? (aiSalaryDisclosed.count || 0) >= (jobsWithSalaryRange.count || 0) * 0.8 : true,
      noRawHtml: (jobsRawHtml.count || 0) === 0,
      recentRenderingOk: recentIds.length ? (recentWithAI / recentIds.length) >= 0.8 : false,
      noFailedQueue: (queueFailed.count || 0) === 0,
      providerHasHealthy: providerHealth.some((p: any) => p.isHealthy),
    },
  })
}
