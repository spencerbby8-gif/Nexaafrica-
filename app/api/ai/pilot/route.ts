import { NextResponse } from 'next/server'
import { isPipelineAuthorized } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { withPilotBudget } from '@/lib/ai/request-budget'
import { processAIQueue } from '@/lib/ai/engine'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300
/** Uses an existing, explicitly provisioned run. Never expands its job set,
 * creates a budget, runs discovery probes, or chains into the global queue. */
export async function POST(req:Request) {
 if(!isPipelineAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
 const expected=req.headers.get('x-nexa-expected-commit')
 if(expected && expected!==process.env.VERCEL_GIT_COMMIT_SHA)return NextResponse.json({error:'Deployment mismatch'},{status:409})
 const body=await req.json().catch(()=>null)
 if(!body || !/^[a-f0-9-]{36}$/i.test(body.run_id||''))return NextResponse.json({error:'Invalid run'},{status:400})
 const sb=createServiceClient()
 const {data:run,error}=await sb.from('ai_pilot_runs').select('*').eq('id',body.run_id).maybeSingle()
 if(error || !run || run.status!=='active' || !run.job_ids?.length || run.job_ids.length>20)return NextResponse.json({error:'Run unavailable'},{status:409})
 const result=await withPilotBudget(run.id,()=>processAIQueue(Math.min(20,run.job_ids.length),{jobIds:run.job_ids,maintenance:false}))
 const {data:budget}=await sb.from('ai_pilot_runs').select('id,requests_reserved,max_requests,status').eq('id',run.id).single()
 return NextResponse.json({result,budget})
}

export async function GET(req:Request){
 if(!isPipelineAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
 return NextResponse.json({commit:process.env.VERCEL_GIT_COMMIT_SHA||null,publication:'editorial_gate',version:'research-v4.4'})
}
