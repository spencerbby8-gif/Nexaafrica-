import {z} from 'zod'
export const researchInput=z.object({run_id:z.string().uuid(),job_id:z.string().uuid(),sources:z.array(z.object({url:z.string().url(),kind:z.enum(['official','job_listing','independent','transaction_party','registry'])})).min(2).max(6),search_queries:z.array(z.string().min(3).max(250)).max(12),excluded_matches:z.array(z.object({url:z.string().url(),reason:z.string().max(400)})).max(12).default([])})
export const reportSchema=z.object({
 identity:z.enum(['documented','unresolved','conflicting']),
 job_authenticity:z.enum(['unresolved','conflicting']),
 reputation:z.enum(['limited_history','unresolved','conflicting']),
 paragraphs:z.array(z.object({topic:z.enum(['identity','history','job','eligibility','risk']),claim_type:z.enum(['reported_fact','assessment']),text:z.string().min(20).max(900),citations:z.array(z.object({source_id:z.string().uuid(),quote:z.string().min(12).max(200)})).min(1).max(3)})).min(2).max(7),
 limitations:z.array(z.string().min(10).max(400)).min(2).max(8),
})
export type ResearchReport=z.infer<typeof reportSchema>
export type CitableSource={id:string;source_kind:string;status:string;content:string;url:string;fetched_at?:string;published_at?:string|null}
const norm=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim()
export function validateResearchReport(raw:unknown,sources:CitableSource[],company?:string):ResearchReport {
 const report=reportSchema.parse(raw),map=new Map(sources.map(s=>[s.id,s]))
 for(const paragraph of report.paragraphs){
  if(/\b(?:guaranteed|scam-free|safe employer|proven legitimate)\b/i.test(paragraph.text))throw new Error('Unsupported assurance')
  for(const citation of paragraph.citations){const source=map.get(citation.source_id);if(!source||source.status!=='fetched'||!norm(source.content).includes(norm(citation.quote)))throw new Error('Unsupported research citation')}
 }
 // Board copies and employer marketing are not independent corroboration.
 const identityCitations=new Set(report.paragraphs.filter(p=>p.topic==='identity').flatMap(p=>p.citations.map(c=>c.source_id)))
 const external=sources.some(s=>s.status==='fetched'&&['independent','transaction_party','registry'].includes(s.source_kind)&&(!company||s.content.toLowerCase().includes(company.toLowerCase())))
 const citedExternal=sources.some(s=>identityCitations.has(s.id)&&s.status==='fetched'&&['independent','transaction_party','registry'].includes(s.source_kind)&&(!company||s.content.toLowerCase().includes(company.toLowerCase())))
 const official=sources.some(s=>s.status==='fetched'&&s.source_kind==='official')
 if(report.identity==='documented'&&!(citedExternal&&official))throw new Error('Company identity lacks corroboration')
 if(report.reputation==='limited_history'&&!external)throw new Error('Historical reputation lacks external sources')
 const quoted=new Map<string,Set<string>>()
 for(const p of report.paragraphs)for(const c of p.citations){if(!quoted.has(c.source_id))quoted.set(c.source_id,new Set());quoted.get(c.source_id)!.add(c.quote)}
 for(const quotes of quoted.values())if([...quotes].join(' ').split(/\s+/).length>90)throw new Error('Excessive source quotation')
 return report
}
