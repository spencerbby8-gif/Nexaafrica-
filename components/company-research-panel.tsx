import Link from 'next/link'
import type {getCompanyInvestigation} from '@/lib/research/queries'
type Investigation=NonNullable<Awaited<ReturnType<typeof getCompanyInvestigation>>>
export function CompanyResearchPanel({investigation}:{investigation:Investigation|null}){
 if(!investigation)return <section className="rounded-lg border p-5"><h3 className="font-semibold">Company investigation</h3><p className="mt-2 text-sm text-muted-foreground">No documented company investigation has been published for this role. A listing or model score does not establish employer legitimacy.</p></section>
 const r=investigation.report as any
 const sources=new Map(investigation.sources.map((s:any)=>[s.id,s]))
 return <section aria-label="Documented company investigation" className="rounded-lg border p-5">
  <h2 className="text-xl font-semibold">{investigation.company}: company investigation</h2>
  <p className="mt-2 text-xs text-muted-foreground">AI-written, agent-edited analysis of retained public sources · reviewed {new Date(investigation.completed_at||investigation.created_at).toLocaleDateString('en-GB')} · limited investigation, not a safety guarantee</p>
  <dl className="my-4 grid gap-3 text-sm sm:grid-cols-3">{[['Company identity',r.identity],['This job’s authenticity',r.job_authenticity],['Historical record',r.reputation]].map(([label,status])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{String(status).replaceAll('_',' ')}</dd></div>)}</dl>
  <div className="space-y-5">{r.paragraphs.map((p:any,i:number)=><div key={i}><h3 className="text-sm font-semibold capitalize">{p.topic} · {p.claim_type==='assessment'?'Assessment':'Source-reported facts'}</h3><p className="mt-1 text-sm leading-relaxed">{p.text}</p><div className="mt-2 space-y-2">{p.citations.map((c:any,k:number)=>{const s:any=sources.get(c.source_id);return s?<blockquote key={k} className="border-l-2 pl-3 text-xs text-muted-foreground">“{c.quote}” <a href={s.final_url||s.url} target="_blank" rel="noopener noreferrer" className="underline">[{k+1}] {s.title||new URL(s.url).hostname}</a></blockquote>:null})}</div></div>)}</div>
  <h3 className="mt-5 text-sm font-semibold">What remains unverified</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{r.limitations.map((v:string,i:number)=><li key={i}>{v}</li>)}</ul>
  <p className="mt-4 text-xs text-muted-foreground">Source discovery was operator-curated. Nexa retrieved, retained and checked quotations, then used {investigation.provider_model} to draft the analysis. An Arena repair agent edited and separately checked the draft against retained sources before publication; this is not independent human certification. This limited review is not a background check or a guarantee of hiring eligibility.</p>
  <Link href={`/research/${investigation.id}`} className="mt-3 inline-block text-xs underline">Permanent research record</Link>
 </section>
}
