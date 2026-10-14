import {NextResponse} from 'next/server'
import {isPipelineAuthorized} from '@/lib/server/auth'
import {investigateCompany} from '@/lib/research/investigate'
import {researchInput} from '@/lib/research/contract'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=300
export async function POST(req:Request){
 if(!isPipelineAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401})
 const input=researchInput.safeParse(await req.json().catch(()=>null))
 if(!input.success)return NextResponse.json({error:'Invalid investigation request'},{status:400})
 try{return NextResponse.json(await investigateCompany(input.data))}
 catch{return NextResponse.json({error:'Investigation not published; consult retained source and request records'},{status:422})}
}
