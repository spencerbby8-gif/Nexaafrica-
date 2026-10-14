import { NextRequest, NextResponse } from 'next/server'
import { getPublicJobsPage } from '@/lib/jobs/public-feed'
import { decodeJobCursor } from '@/lib/jobs/cursor'
import type { JobFilters } from '@/lib/types'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const p=request.nextUrl.searchParams
  const cursor=p.get('cursor')
  if (cursor) {try {decodeJobCursor(cursor)} catch {return NextResponse.json({error:'Invalid cursor'},{status:400})}}
  const filters: JobFilters={
    category:p.get('category')||undefined,country:p.get('country')||undefined,
    remoteOnly:p.get('remote')==='1',openToAfrica:p.get('africa')==='1',
    usdOnly:p.get('usd')==='1',verifiedOnly:p.get('verified')==='1',
    employmentType:(p.get('employment_type') as JobFilters['employmentType'])||undefined,
    freshDays:Number(p.get('fresh'))||undefined,q:p.get('q')||undefined,
    limit:Math.min(100,Math.max(1,Number(p.get('limit'))||20)),
  }
  try {return NextResponse.json(await getPublicJobsPage(filters,cursor))}
  catch {return NextResponse.json({error:'Unable to load jobs'},{status:503})}
}
