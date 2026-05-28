export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function postedLabel(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return 'Posted just now'
  const hours = Math.floor(minutes / 60)
  if (hours < 1) return 'Posted just now'
  if (hours < 24) return `Posted ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Posted yesterday'
  if (days < 7) return `Posted ${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `Posted ${weeks} week${weeks === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `Posted ${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(days / 365)
  return `Posted ${years} year${years === 1 ? '' : 's'} ago`
}

export function isFresh(iso: string, days = 7): boolean {
  const then = new Date(iso).getTime()
  return Date.now() - then < days * 24 * 60 * 60 * 1000
}

const monthFormatter =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })
    : null

/**
 * "Joined March 2025" — used on profile to reinforce continuity of identity.
 */
export function joinedLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const formatted = monthFormatter
    ? monthFormatter.format(d)
    : `${d.getUTCFullYear()}`
  return `Joined ${formatted}`
}

export function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

const employmentLabelMap: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

export function employmentLabel(type: string): string {
  return employmentLabelMap[type] ?? type
}
