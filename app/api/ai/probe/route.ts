import { NextResponse } from 'next/server'
import { isPipelineAuthorized } from '@/lib/server/auth'
import { probeProvider } from '@/lib/ai/orchestrator'
import { PROVIDERS } from '@/lib/ai/providers/types'
import { getBenchmarkJobs, runBenchmark, compareBenchmarks } from '@/lib/ai/benchmark'

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 300

export async function POST(req: Request) {
  if (!isPipelineAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'benchmark') {
    const started = Date.now()
    const jobs = await getBenchmarkJobs()
    if (!jobs.length) return NextResponse.json({ error: 'No benchmark jobs found' }, { status: 500 })
    const current = await runBenchmark(jobs)
    const comparison = await compareBenchmarks(current)
    return NextResponse.json({
      ok: true, elapsedMs: Date.now() - started, jobsTested: jobs.length,
      summary: comparison.summary, regressions: comparison.regressions.slice(0, 10),
      results: current.map(r => ({
        job: r.jobTitle?.slice(0,50), company: r.company, source: r.source,
        provider: r.provider, quality: r.qualityScore, latency: r.latencyMs,
        aiUsed: r.aiUsed, hallucinations: r.hallucinationRisk,
      })),
    })
  }

  let probed = 0, success = 0, failed = 0
  const results: any[] = []
  for (const cfg of PROVIDERS) {
    if (!cfg.enabled) continue
    probed++
    const start = Date.now()
    const result = await probeProvider(cfg)
    const latency = Date.now() - start
    if (result.ok) success++; else failed++
    results.push({ provider: cfg.id, model: cfg.model, ok: result.ok, latencyMs: latency, error: result.error?.slice(0,200) || null })
  }
  return NextResponse.json({ ok: true, probed, success, failed, results })
}

export const GET = POST
