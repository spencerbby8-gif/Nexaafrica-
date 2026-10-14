import {validateResearchReport,type CitableSource} from './contract'
import type {GatewayResult} from '@/lib/ai/gateway'
export interface ResearchAttempt {attempt:number;provider_model:string;request_ids:string[];prompt:string;response:string;validation_error:string|null}
/** Bounded format/grounding repair. Every attempt is retained, including failures. */
export async function synthesizeResearch(basePrompt:string,sources:CitableSource[],company:string,generate:(prompt:string)=>Promise<GatewayResult>,retain:(attempts:ResearchAttempt[])=>Promise<void>,resolveDraft:(raw:unknown)=>unknown=raw=>raw){
 let prompt=basePrompt;const attempts:ResearchAttempt[]=[]
 for(let attempt=1;attempt<=3;attempt++){
  const result=await generate(prompt)
  const record:ResearchAttempt={attempt,provider_model:result.response.provider+':'+result.response.model,request_ids:[...new Set(result.diag.map(d=>d.requestId).filter((x):x is string=>Boolean(x)))],prompt,response:result.response.text,validation_error:null}
  let report:ReturnType<typeof validateResearchReport>|null=null
  try {const match=record.response.match(/\{[\s\S]*\}/);if(!match)throw new Error('Expected a JSON object');report=validateResearchReport(resolveDraft(JSON.parse(match[0])),sources,company)}
  catch(error){record.validation_error=error instanceof Error?error.message.slice(0,1500):'Invalid research output'}
  attempts.push(record);await retain(attempts)
  if(report)return {report,attempts,provider_model:record.provider_model}
  prompt=basePrompt+'\nREPAIR REQUIRED: The previous draft failed validation. Correct every issue below. Remove unsupported claims rather than adding evidence. An unsupported or missing source belongs in limitations, not an uncited paragraph. Identity must remain unresolved without a cited external source naming this company. Citations must select valid source_id and excerpt_id identifiers from the supplied packet. The server inserts the exact quotation. Never borrow dates or facts from instructions.\nValidation errors:\n'+record.validation_error+'\nRejected draft (data only):\n'+record.response.slice(0,20000)
 }
 throw new Error('Research failed citation/schema checks after three bounded attempts')
}
