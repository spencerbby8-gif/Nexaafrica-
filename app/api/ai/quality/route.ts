import { NextResponse } from 'next/server'
import { evaluateAndPersist } from '@/lib/ai/quality'

export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=120
function isAuthorized(req:Request):boolean{ if(req.headers.get('x-vercel-cron')==='1')return true; const t=process.env.INGEST_TOKEN; if(!t)return false; return req.headers.get('authorization')===`Bearer ${t}` }

export async function POST(req:Request){ if(!isAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
  const u=new URL(req.url); const limit=Math.min(500,Math.max(1,Number(u.searchParams.get('limit'))||100))
  const started=Date.now(); const r=await evaluateAndPersist(limit)
  return NextResponse.json({ok:true,elapsedMs:Date.now()-started,...r}) }
export const GET=POST
