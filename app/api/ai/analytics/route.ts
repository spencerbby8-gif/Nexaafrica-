import {NextResponse} from 'next/server'
import {isPipelineAuthorized} from '@/lib/server/auth'
import {createServiceClient} from '@/lib/supabase/service'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function GET(req:Request){
 if(!isPipelineAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
 const sb=createServiceClient()
 const [prov,hourly,recent]=await Promise.all([
  sb.from('ai_measured_request_analytics').select('*').order('total_calls',{ascending:false}),
  sb.from('ai_measured_request_hourly').select('*').order('hour',{ascending:false}).limit(72),
  sb.from('ai_model_requests').select('id,provider,model,agent_id,outcome,started_at,finished_at').order('started_at',{ascending:false}).limit(200),
 ])
 if(prov.error||hourly.error||recent.error)return NextResponse.json({error:'Measured request analytics unavailable'},{status:503})
 const providers=prov.data||[]
 const totals=providers.reduce((a,p)=>({calls:a.calls+Number(p.total_calls),success:a.success+Number(p.successes),failure:a.failure+Number(p.failures),inFlight:a.inFlight+Number(p.in_flight)}),{calls:0,success:0,failure:0,inFlight:0})
 return NextResponse.json({timestamp:new Date().toISOString(),scope:'Instrumented pilot request ledger only; legacy provider event rows are excluded',meaning:'Provider request outcomes are not evidence of factual accuracy or employer legitimacy',summary:{totalCalls:totals.calls,totalSuccess:totals.success,totalFail:totals.failure,inFlight:totals.inFlight,successRate:totals.success+totals.failure?Math.round(100*totals.success/(totals.success+totals.failure)):null},providers,recent:recent.data||[],hourlyTrends:hourly.data||[],hourlyLimit:72})
}
