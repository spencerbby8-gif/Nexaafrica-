import {researchExcerptPacket} from '@/lib/research/excerpts'
import {synthesizeResearch} from '@/lib/research/synthesis'
import {normalizeProviderText} from '@/lib/ai/provider-text'
import {describe,it,expect} from 'vitest'
import {isPublicAddress,researchURL} from '@/lib/research/public-fetch'
import {validateResearchReport,type CitableSource} from '@/lib/research/contract'
import {enforceTruthfulness} from '@/lib/ai/verifiers/consolidated'
const id='00000000-0000-0000-0000-000000000001'
const source:CitableSource={id,source_kind:'official',status:'fetched',content:'Acme offers a paid trading education community. We hire worldwide.',url:'https://example.com'}
const paragraph={topic:'identity',claim_type:'assessment',text:'The site describes a trading education service; independent employer identity is unresolved.',citations:[{source_id:id,quote:'Acme offers a paid trading education community.'}]}
const report=()=>({identity:'unresolved',job_authenticity:'unresolved',reputation:'unresolved',paragraphs:[paragraph,{...paragraph,topic:'job'}],limitations:['Payroll terms have not been independently established.','This is a limited public-web investigation, not a background check.']})
describe('documented company research',()=>{
 it('resolves only real retained excerpts without allowing fabricated quotations',()=>{
  const {packet,resolve}=researchExcerptPacket([source]);const raw=report();raw.paragraphs=raw.paragraphs.map(p=>({...p,citations:[{source_id:'S1',excerpt_id:'E1'} as any]}))
  const resolved:any=resolve(raw);expect(resolved.paragraphs[0].citations[0]).toEqual({source_id:source.id,quote:packet[0].excerpts[0].text})
  raw.paragraphs[0].citations[0]={source_id:'S1',excerpt_id:'E999'} as any;expect(()=>resolve(raw)).toThrow('Unknown retained excerpt')
 })
 it('retains failed drafts and performs only bounded repairs without weakening citation checks',async()=>{
  const retained:any[]=[];let n=0
  const generate=async()=>({response:{text:n++===0?'{}':JSON.stringify(report()),provider:'mistral',model:'test'},diag:[]} as any)
  const result=await synthesizeResearch('test',[source],'Acme',generate,async attempts=>{retained.push(JSON.parse(JSON.stringify(attempts)))})
  expect(n).toBe(2);expect(retained[0][0].validation_error).toBeTruthy();expect(result.report.identity).toBe('unresolved')
  n=0;await expect(synthesizeResearch('test',[source],'Acme',async()=>{n++;return {response:{text:'{}',provider:'mistral',model:'test'},diag:[]} as any},async()=>{})).rejects.toThrow('three bounded attempts');expect(n).toBe(3)
 })
 it('normalizes Cloudflare object responses and rejects empty provider output',()=>{
  expect(JSON.parse(normalizeProviderText({identity:'unresolved'}))).toEqual({identity:'unresolved'})
  expect(normalizeProviderText([{type:'text',text:'hello'}])).toBe('hello')
  expect(()=>normalizeProviderText(null)).toThrow()
 })
 it('blocks private, loopback, link-local and disguised IP destinations',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.20.0.1','192.168.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])expect(isPublicAddress(ip)).toBe(false)
  expect(isPublicAddress('8.8.8.8')).toBe(true)
  for(const url of ['http://example.com','https://user:pass@example.com','https://127.1','https://[::1]','https://example.com:8080'])expect(()=>researchURL(url)).toThrow()
 })
 it('accepts cited analysis but rejects invented or blocked-source quotes',()=>{
  expect(validateResearchReport(report(),[source]).identity).toBe('unresolved')
  expect(()=>validateResearchReport(report(),[{...source,status:'blocked'}])).toThrow()
  const bad=report();bad.paragraphs[0]={...paragraph,citations:[{source_id:id,quote:'A fabricated company claim.'}]};expect(()=>validateResearchReport(bad,[source])).toThrow()
 })
 it('does not turn employer marketing or board copies into corroborated identity',()=>{
  expect(()=>validateResearchReport({...report(),identity:'documented'},[source], 'Acme')).toThrow()
  const unrelated={...source,id:'00000000-0000-0000-0000-000000000002',source_kind:'independent',content:'An unrelated company raised funding.'}
  expect(()=>validateResearchReport({...report(),identity:'documented'},[source,unrelated],'Acme')).toThrow()
 })
 it('refuses to authenticate a job solely through company research',()=>{
  expect(()=>validateResearchReport({...report(),job_authenticity:'verified'},[source])).toThrow()
 })
 it('downgrades DEUNA-style marketing quotations even when the page contains global hiring elsewhere',()=>{
  const text='Our platform revolutionizes global commerce. We hire worldwide.'
  const ai:any={africa_eligibility:'likely',africa_confidence:90,africa_evidence:'Our platform revolutionizes global commerce.',remote_eligibility:'unknown',visa_sponsorship:'unknown',company_legitimacy:'unknown',salary_min:null,salary_max:null,salary_transparency:'unknown'}
  const job:any={location:'Remote',country:'Worldwide',description_md:text,is_remote:true}
  const result=enforceTruthfulness(ai,{job,truth:text,jobTruth:text,hasCompanyPage:false})
  expect(result.africa_eligibility).toBe('unknown');expect(result.africa_confidence).toBe(0)
 })
})
