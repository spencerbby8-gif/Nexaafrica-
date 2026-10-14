import type { Job } from '@/lib/types'
import { classifyEligibility } from '@/lib/ingest/normalize'
import { isVerifiedAfricaOpen } from '@/lib/ai/verified'

type PublicCandidate = Job & { aiIntelligence?: any; _queueError?: string | null; _queueStatus?: string | null }
export function isPublicJob(job: PublicCandidate, verifiedOnly = false, now = Date.now()): boolean {
  if (job.is_active !== true || job.is_remote !== true || job.is_flagged === true) return false
  if (job.expires_at && new Date(job.expires_at).getTime() <= now) return false
  if (!job.last_seen_at || new Date(job.last_seen_at).getTime() < now - 30 * 86400000) return false
  if (job.eligibility === 'restricted' || job.is_open_to_africa !== true) return false
  if (/^Rejected:/i.test(job._queueError || '') || job._queueStatus === 'rejected') return false
  const sourceVerdict = classifyEligibility(job.location, job.title, job.description_md)
  if (sourceVerdict !== 'explicit' && sourceVerdict !== 'likely') return false
  const ai = job.aiIntelligence
  if (ai && !['explicit', 'likely'].includes(ai.africa_eligibility)) return false
  if (ai && ['hybrid','onsite'].includes(ai.remote_eligibility) && (ai.remote_confidence ?? 0) >= 60) return false
  return !verifiedOnly || isVerifiedAfricaOpen(ai)
}
