import type { JobFilters } from '@/lib/types'
export function jobFilterParams(filters: JobFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (filters.category) p.set('category', filters.category)
  if (filters.country) p.set('country', filters.country)
  if (filters.remoteOnly) p.set('remote', '1')
  if (filters.openToAfrica) p.set('africa', '1')
  if (filters.usdOnly) p.set('usd', '1')
  if (filters.verifiedOnly) p.set('verified', '1')
  if (filters.employmentType) p.set('employment_type', filters.employmentType)
  if (filters.freshDays) p.set('fresh', String(filters.freshDays))
  if (filters.q) p.set('q', filters.q)
  return p
}
