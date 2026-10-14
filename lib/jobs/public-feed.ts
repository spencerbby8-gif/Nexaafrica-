import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getAIIntelligenceWithQueueStatus, type JobWithAI } from '@/lib/ai/queries'
import type { Job, JobFilters } from '@/lib/types'
import { JOB_COLUMNS } from './columns'
import { decodeJobCursor, encodeJobCursor } from './cursor'
import { isPublicJob } from './public-policy'

/** One contract for SSR and continuation. Stable posted_at + id order, with the
 * cursor anchored to the last examined row, never a discarded display window. */
export async function getPublicJobsPage(filters: JobFilters = {}, cursor: string | null = null) {
  const supabase = await createClient()
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20))
  const jobs: JobWithAI<Job>[] = []
  let anchor = cursor ? decodeJobCursor(cursor) : null
  let hasMore = false
  for (let window = 0; window < 20 && jobs.length < limit; window++) {
    let query = supabase.from('jobs').select(JOB_COLUMNS)
      .eq('is_active', true).eq('is_remote', true).eq('is_open_to_africa', true)
      .not('eligibility','eq','restricted')
      .gte('last_seen_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('posted_at', {ascending:false}).order('id', {ascending:false}).limit(100)
    if (anchor) query = query.or(`posted_at.lt.${anchor.posted_at},and(posted_at.eq.${anchor.posted_at},id.lt.${anchor.id})`)
    if (filters.category) query = query.eq('category',filters.category)
    if (filters.country) query = query.ilike('country',filters.country)
    if (filters.employmentType) query = query.eq('employment_type',filters.employmentType)
    if (filters.usdOnly) query = query.or('salary_currency.eq.USD,and(salary_currency.is.null,salary_range.ilike.%USD%)')
    if (filters.freshDays && filters.freshDays > 0) query = query.gte('posted_at',new Date(Date.now()-filters.freshDays*86400000).toISOString())
    if (filters.q) {
      const safe = filters.q.replace(/[(),.%*\\]/g,' ').trim().slice(0,120)
      if (safe) query = query.or(`title.ilike.%${safe}%,company.ilike.%${safe}%`)
    }
    const {data,error} = await query
    if (error) throw new Error('Job feed query failed')
    const rows = (data || []) as unknown as Job[]
    if (!rows.length) {hasMore=false;break}
    const {aiMap,queueStatus,queueError} = await getAIIntelligenceWithQueueStatus(rows.map(j=>j.id))
    for (let i=0;i<rows.length;i++) {
      const row=rows[i]
      anchor = {posted_at:row.posted_at,id:row.id}
      const job = {...row, aiIntelligence:aiMap.get(row.id)||null, _queueStatus:queueStatus.get(row.id)||null, _queueError:queueError.get(row.id)||null}
      if (isPublicJob(job,filters.verifiedOnly)) jobs.push(job)
      hasMore = i < rows.length-1 || rows.length===100
      if (jobs.length===limit) break
    }
    if (rows.length<100 || jobs.length===limit) break
  }
  return {jobs, nextCursor:hasMore && anchor ? encodeJobCursor(anchor):null, hasMore}
}
