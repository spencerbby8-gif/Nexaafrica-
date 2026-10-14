import { createHash } from 'node:crypto'
/** Hash the entire canonical source URL, never a truncated common URL prefix. */
export function stableSourceId(source: string, link: string): string {
  const url = new URL(link)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(?:ref|source)$/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  return `${source}:${createHash('sha256').update(url.toString()).digest('hex').slice(0, 32)}`
}
