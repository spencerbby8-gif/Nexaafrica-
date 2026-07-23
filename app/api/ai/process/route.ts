import { NextResponse } from 'next/server'
import { processAIQueue } from '@/lib/ai/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const batch = Math.max(1, Math.min(50, Number(url.searchParams.get('batch')) || 10))

  const started = Date.now()
  const result = await processAIQueue(batch)
  const elapsedMs = Date.now() - started

  return NextResponse.json({ ok: true, elapsedMs, ...result }, { status: 200 })
}

export const GET = POST
