import 'server-only'
import {z} from 'zod'
import {createServiceClient} from '@/lib/supabase/service'
import {validateResearchReport,type CitableSource} from './contract'
export const publicationInput=z.object({investigation_id:z.string().uuid(),report:z.unknown(),notes:z.array(z.string().min(10).max(800)).min(2).max(12)})
/** A separate, explicitly attributed edited edition. Original attempts remain immutable.
 * This validates quotations/schema, NOT semantic truth: the authorized editor must
 * compare every assertion with retained evidence before calling this boundary. */
export async function publishCompanyInvestigation(input:unknown){
 const request=publicationInput.parse(input),sb=createServiceClient()
 const {data:record,error}=await sb.from('company_investigations').select('id,company,status,published_at,publication_report,model_outputs,model_request_ids,provider_model').eq('id',request.investigation_id).single()
 if(error||!record||!['reviewed','failed'].includes(record.status)||record.published_at||record.publication_report)throw new Error('No unpublished terminal draft')
 if(!record.provider_model||!record.model_outputs?.some((a:any)=>a.response?.trim())||!record.model_request_ids?.length)throw new Error('No retained model draft provenance')
 const {data:calls,error:callError}=await sb.from('ai_model_requests').select('id').in('id',record.model_request_ids).eq('outcome','success').limit(1)
 if(callError||!calls?.length)throw new Error('No successful recorded model request')
 const {data:sources,error:sourceError}=await sb.from('company_research_sources').select('id,source_kind,status,content,url').eq('investigation_id',record.id)
 if(sourceError||!sources?.length)throw new Error('No retained research evidence')
 const report=validateResearchReport(request.report,sources as CitableSource[],record.company)
 const now=new Date().toISOString()
 const {data:saved,error:saveError}=await sb.from('company_investigations').update({publication_report:report,published_at:now,editorial_review:{reviewer:'Arena repair agent',reviewer_type:'ai_agent',reviewed_at:now,notes:request.notes,code_commit:process.env.VERCEL_GIT_COMMIT_SHA||null,original_model_outputs_retained:true}}).eq('id',record.id).is('published_at',null).is('publication_report',null).select('id').single()
 if(saveError||!saved)throw new Error('Publication not saved; no draft overwritten')
 return {investigation_id:saved.id,publication:'published_edited_edition',draft_status:record.status}
}
