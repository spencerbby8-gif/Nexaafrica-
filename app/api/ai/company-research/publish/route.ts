import {NextResponse} from 'next/server'
import {isPipelineAuthorized} from '@/lib/server/auth'
import {publishCompanyInvestigation,publicationInput} from '@/lib/research/publication'
export const dynamic='force-dynamic'
export async function POST(req:Request){
 if(!isPipelineAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
 const expected=req.headers.get('x-nexa-expected-commit')
 if(expected && expected!==process.env.VERCEL_GIT_COMMIT_SHA)return NextResponse.json({error:'Deployment mismatch'},{status:409})
 const input=publicationInput.safeParse(await req.json().catch(()=>null))
 if(!input.success)return NextResponse.json({error:'Invalid publication input'},{status:400})
 try{return NextResponse.json(await publishCompanyInvestigation(input.data))}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Publication failed'},{status:422})}
}
