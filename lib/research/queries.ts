import 'server-only'
import {createServiceClient} from '@/lib/supabase/service'
export async function getCompanyInvestigation(id:string,byJob=false){
 const sb=createServiceClient()
 // Only the separately approved edition is public; original machine drafts remain private.
 let query=sb.from('company_investigations').select('id,job_id,company,created_at,completed_at,status,publication_report,provider_model,published_at,editorial_review').in('status',['reviewed','failed']).not('published_at','is',null).not('publication_report','is',null)
 query=byJob?query.eq('job_id',id).order('published_at',{ascending:false}).limit(1):query.eq('id',id)
 const {data:rows,error}=await query
 if(error||!rows?.length)return null
 const record=rows[0]
 const {data:sources}=await sb.from('company_research_sources').select('id,url,final_url,source_kind,title,fetched_at,published_at,status,http_status,content_hash').eq('investigation_id',record.id)
 return {...record,report:record.publication_report,sources:sources||[]}
}
