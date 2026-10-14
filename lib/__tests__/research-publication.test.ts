import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({responses:[] as any[],updates:[] as any[]}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/supabase/service',()=>({createServiceClient:()=>({from:()=>{
 const response=state.responses.shift();const q:any={then:(resolve:any,reject:any)=>Promise.resolve(response).then(resolve,reject)}
 for(const method of ['select','eq','is','in','limit'])q[method]=()=>q
 q.single=()=>Promise.resolve(response);q.update=(value:any)=>{state.updates.push(value);return q};return q
}})}))
import {publishCompanyInvestigation} from '@/lib/research/publication'
import {POST} from '@/app/api/ai/company-research/publish/route'
const id='00000000-0000-0000-0000-000000000001'
const source={id,source_kind:'official',status:'fetched',content:'Acme describes a trading education community.',url:'https://example.com'}
const paragraph={topic:'identity',claim_type:'assessment',text:'This self-published description does not establish independent corporate identity.',citations:[{source_id:id,quote:source.content}]}
const report={identity:'unresolved',job_authenticity:'unresolved',reputation:'unresolved',paragraphs:[paragraph,{...paragraph,topic:'job'}],limitations:['No independent employer-control verification was performed.','Country-specific hiring terms remain unresolved.']}
const input={investigation_id:id,report,notes:['Every assertion checked against retained source text.','The model draft is retained separately from this edited edition.']}
const record={id,company:'Acme',status:'failed',published_at:null,publication_report:null,model_outputs:[{response:'Retained original draft'}],model_request_ids:[id],provider_model:'cohere:test-model'}
beforeEach(()=>{state.responses=[];state.updates=[]})
describe('separate edited research publication',()=>{
 it('preserves a failed original draft while validating and publishing an edited edition',async()=>{
  state.responses=[{data:record},{data:[{id}]},{data:[source]},{data:{id}}]
  expect(await publishCompanyInvestigation(input)).toMatchObject({publication:'published_edited_edition',draft_status:'failed'})
  expect(Object.keys(state.updates[0]).sort()).toEqual(['editorial_review','publication_report','published_at'])
  expect(state.updates[0].editorial_review.reviewer_type).toBe('ai_agent')
 })
 it('rejects an invented quotation without writing publication metadata',async()=>{
  state.responses=[{data:record},{data:[{id}]},{data:[source]}]
  const changed={...report,paragraphs:[{...paragraph,citations:[{source_id:id,quote:'This invented quotation is not in the retained source.'}]},{...paragraph,topic:'job'}]}
  await expect(publishCompanyInvestigation({...input,report:changed})).rejects.toThrow('Unsupported research citation');expect(state.updates).toHaveLength(0)
 })
 it('requires a successful recorded model request, not just a model label',async()=>{
  state.responses=[{data:record},{data:[]}]
  await expect(publishCompanyInvestigation(input)).rejects.toThrow('No successful recorded model request');expect(state.updates).toHaveLength(0)
 })
 it('cannot overwrite an already published edition',async()=>{
  state.responses=[{data:{...record,publication_report:report}}]
  await expect(publishCompanyInvestigation(input)).rejects.toThrow('No unpublished terminal draft');expect(state.updates).toHaveLength(0)
 })
 it('rejects unauthenticated publication',async()=>{
  const response=await POST(new Request('https://example.com/api/ai/company-research/publish',{method:'POST'}));expect(response.status).toBe(401);expect(state.updates).toHaveLength(0)
 })
})
