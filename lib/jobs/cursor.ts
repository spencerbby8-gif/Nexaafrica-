export interface JobCursor { posted_at: string; id: string }
export function encodeJobCursor(row: JobCursor): string {
  return Buffer.from(JSON.stringify([row.posted_at, row.id])).toString('base64url')
}
export function decodeJobCursor(value: string): JobCursor {
  try {
    const [posted_at, id] = JSON.parse(Buffer.from(value, 'base64url').toString())
    if (typeof posted_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(posted_at) || !Number.isFinite(Date.parse(posted_at)) || typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw Error()
    return {posted_at, id}
  } catch { throw new Error('Invalid job cursor') }
}
