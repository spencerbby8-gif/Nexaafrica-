export function formatSalary(min?: number, max?: number, currency = 'USD'): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`
    return `${n}`
  }
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''
  if (min && max) return `${symbol}${fmt(min)} – ${symbol}${fmt(max)}`
  if (min) return `${symbol}${fmt(min)}+`
  return `${symbol}${fmt(max!)}`
}

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
