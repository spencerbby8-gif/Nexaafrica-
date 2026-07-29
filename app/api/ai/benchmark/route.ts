import { NextResponse } from 'next/server'
import { getBenchmarkJobs, runBenchmark, compareBenchmarks } from '@/lib/ai/benchmark'

export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=300
function isAuthorized(req:Request):boolean{ if(req.headers.get('x-vercel-cron')==='1')return true; const t=process.env.INGEST_TOKEN; if(!t)return false; return req.headers.get('authorization')===`Bearer ${t}` }

export async function POST(req:Request){
  if(!isAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
  const jobs=await getBenchmarkJobs()
  if(!jobs.length)return NextResponse.json({error:'No benchmark jobs found — run ingest first'},{status:500})
  const started=Date.now(); const current=await runBenchmark(jobs)
  const comparison=await compareBenchmarks(current)
  return NextResponse.json({ok:true,elapsedMs:Date.now()-started,jobsTested:jobs.length,
    summary:comparison.summary,regressions:comparison.regressions,
    results:current.map(r=>({job:r.jobTitle,company:r.company,source:r.source,
      provider:r.provider,quality:r.qualityScore,latency:r.latencyMs,aiUsed:r.aiUsed}))
  })
}
export const GET=POST
