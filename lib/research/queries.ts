import 'server-only'
import {createServiceClient} from '@/lib/supabase/service'
export async function getCompanyInvestigation(id:string,byJob=false){
 const sb=createServiceClient()
 let query=sb.from('company_investigations').select('id,job_id,company,created_at,completed_at,status,report,provider_model,published_at,editorial_review').eq('status','reviewed').not('published_at','is',null)
 query=byJob?query.eq('job_id',id).order('created_at',{ascending:false}).limit(1):query.eq('id',id)
 const {data:rows,error}=await query
 if(error||!rows?.length)return null
 const report=rows[0]
 const {data:sources}=await sb.from('company_research_sources').select('id,url,final_url,source_kind,title,fetched_at,published_at,status,http_status,content_hash').eq('investigation_id',report.id)
 return {...report,sources:sources||[]}
}
