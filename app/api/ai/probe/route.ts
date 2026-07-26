import { NextResponse } from 'next/server'
import { probeAllProviders } from '@/lib/ai/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const started = Date.now()
  const result = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...result })
}

export const GET = POST
