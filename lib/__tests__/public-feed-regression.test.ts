import { describe, it, expect, vi } from 'vitest'
import { encodeJobCursor,decodeJobCursor } from '@/lib/jobs/cursor'
import { jobFilterParams } from '@/lib/jobs/filters'
import { isPublicJob } from '@/lib/jobs/public-policy'
import { stableSourceId } from '@/lib/ingest/source-id'
import { isVerifiedIntelligence } from '@/lib/ai/verified'

const fixture=()=>({id:'00000000-0000-0000-0000-000000000001',posted_at:'2026-10-14T12:00:00.123456+00:00',is_active:true,is_remote:true,is_open_to_africa:true,eligibility:'likely',location:'Remote',country:'Worldwide',title:'Engineer',description_md:'We hire worldwide. Work from anywhere.',last_seen_at:new Date().toISOString(),expires_at:null,aiIntelligence:{model_version:'mistral:model',quality_score:80,overall_confidence:80,africa_eligibility:'likely',africa_evidence:'We hire worldwide.',africa_confidence:80}} as any)
describe('public visibility contract',()=>{
 it('requires live eligible source evidence and honors adverse pipeline outcomes',()=>{
   const j=fixture();expect(isPublicJob(j,true)).toBe(true)
   for(const override of [{is_active:false},{is_remote:false},{is_flagged:true},{last_seen_at:'2020-01-01'},{expires_at:'2020-01-01'},{_queueError:'Rejected: work authorization'},{_queueStatus:'rejected'},{description_md:'Our customers live across Africa.'}]) expect(isPublicJob({...j,...override})).toBe(false)
   expect(isPublicJob({...j,aiIntelligence:{...j.aiIntelligence,africa_eligibility:'unknown'}})).toBe(false)
 })
 it('never calls zero-confidence or missing-confidence intelligence verified',()=>{
   const ai=fixture().aiIntelligence
   expect(isVerifiedIntelligence({...ai,overall_confidence:0})).toBe(false)
   expect(isVerifiedIntelligence({...ai,overall_confidence:undefined})).toBe(false)
 })
 it('uses both date and unique id without throwing away microseconds',()=>{
   const j=fixture();expect(decodeJobCursor(encodeJobCursor(j))).toEqual({posted_at:j.posted_at,id:j.id})
   expect(()=>decodeJobCursor('2026-10-14')).toThrow()
   expect(()=>decodeJobCursor(Buffer.from(JSON.stringify(['2026-10-14T12:00:00Z','x),is_active.eq.false'])).toString('base64url'))).toThrow()
 })
 it('keeps every filter, including USD and verified, on continuation',()=>{
   const p=jobFilterParams({category:'engineering',country:'Nigeria',remoteOnly:true,openToAfrica:true,usdOnly:true,verifiedOnly:true,employmentType:'contract',q:'engineer',freshDays:7})
   expect(Object.fromEntries(p)).toEqual({category:'engineering',country:'Nigeria',remote:'1',africa:'1',usd:'1',verified:'1',employment_type:'contract',q:'engineer',fresh:'7'})
 })
 it('gives distinct WWR URLs distinct stable identifiers',()=>{
   const a='https://weworkremotely.com/remote-jobs/acme-role-one',b='https://weworkremotely.com/remote-jobs/acme-role-two'
   expect(stableSourceId('weworkremotely',a)).not.toBe(stableSourceId('weworkremotely',b))
   expect(stableSourceId('weworkremotely',a+'?utm_source=email#apply')).toBe(stableSourceId('weworkremotely',a))
 })
})

vi.mock('server-only',()=>({}))
const {db}=vi.hoisted(()=>({db:{rows:[] as any[]}}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:()=>{
 let rows=[...db.rows], cap=100
 const q:any={select:()=>q,eq:()=>q,not:()=>q,gte:()=>q,ilike:()=>q,order:()=>q,limit:(n:number)=>{cap=n;return q},or:(expr:string)=>{
  const m=/posted_at\.lt\.(.+),and\(posted_at\.eq\.(.+),id\.lt\.([a-f0-9-]+)\)/.exec(expr)
  if(m)rows=rows.filter(r=>r.posted_at<m[1]||(r.posted_at===m[2]&&r.id<m[3]))
  return q
 },then:(resolve:any)=>Promise.resolve({data:rows.slice(0,cap),error:null}).then(resolve)};return q
}})}))
vi.mock('@/lib/ai/queries',()=>({getAIIntelligenceWithQueueStatus:async(ids:string[])=>({aiMap:new Map(db.rows.filter(r=>ids.includes(r.id)).map(r=>[r.id,r.aiIntelligence])),queueStatus:new Map(),queueError:new Map()})}))
import { getPublicJobsPage } from '@/lib/jobs/public-feed'
describe('actual shared feed pagination',()=>{
 it('returns all 130 timestamp-tied jobs exactly once across display windows',async()=>{
  db.rows=Array.from({length:130},(_,i)=>({...fixture(),id:`00000000-0000-0000-0000-${(130-i).toString(16).padStart(12,'0')}`}))
  const ids:string[]=[];let cursor:string|null=null
  for(let i=0;i<10;i++){const p=await getPublicJobsPage({limit:20},cursor);ids.push(...p.jobs.map(j=>j.id));cursor=p.nextCursor;if(!p.hasMore)break}
  expect(ids).toEqual(db.rows.map(r=>r.id));expect(new Set(ids).size).toBe(130)
 })
 it('advances through excluded candidates without skipping eligible ones',async()=>{
  db.rows=Array.from({length:130},(_,i)=>({...fixture(),is_active:i%2===0,id:`00000000-0000-0000-0000-${(130-i).toString(16).padStart(12,'0')}`}))
  let cursor:string|null=null;const ids:string[]=[]
  for(let i=0;i<10;i++){const p=await getPublicJobsPage({limit:20},cursor);ids.push(...p.jobs.map(j=>j.id));cursor=p.nextCursor;if(!p.hasMore)break}
  expect(ids).toEqual(db.rows.filter(r=>r.is_active).map(r=>r.id))
 })
})
