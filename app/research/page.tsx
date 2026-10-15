import Link from 'next/link'
import {SiteShell} from '@/components/site-shell'
import {getPublishedInvestigations} from '@/lib/research/queries'
export const dynamic='force-dynamic'
export const metadata={title:'Company investigations | Nexa',description:'Limited, source-backed company research. AI-written drafts, separately checked and edited by an Arena repair agent.'}
export default async function ResearchIndex(){
 const records=await getPublishedInvestigations()
 return <SiteShell><div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
  <header><h1 className="text-3xl font-semibold">Company investigations</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Recent published editions of limited, operator-curated research. Nexa models draft the analysis; an Arena repair agent checks sources and edits the published edition. This is not independent human certification, an employer endorsement, or proof that a particular job accepts applicants from your country.</p></header>
  {records.length===0?<p>No research editions have been approved for publication.</p>:<ul className="space-y-4">{records.map(record=><li key={record.id} className="rounded-lg border p-5"><Link href={`/research/${record.id}`} className="text-xl font-semibold underline underline-offset-4">{record.company}</Link><p className="mt-2 text-sm text-muted-foreground">Published {new Date(record.published_at).toLocaleDateString('en-GB')} · Identity record: {record.publication_report.identity} · Job authenticity: {record.publication_report.job_authenticity}</p><p className="mt-2 text-sm">Read the documented evidence, analysis and unresolved questions.</p></li>)}</ul>}
 </div></SiteShell>
}
