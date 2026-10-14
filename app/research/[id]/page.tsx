import {notFound} from 'next/navigation'
import {SiteShell} from '@/components/site-shell'
import {CompanyResearchPanel} from '@/components/company-research-panel'
import {getCompanyInvestigation} from '@/lib/research/queries'
export const dynamic='force-dynamic'
export default async function ResearchPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params
 if(!/^[a-f0-9-]{36}$/i.test(id))notFound()
 const investigation=await getCompanyInvestigation(id)
 if(!investigation)notFound()
 return <SiteShell><main className="mx-auto max-w-3xl space-y-5 px-4 py-10"><p className="text-sm text-muted-foreground">Research record — not an endorsement or confirmation that this job accepts applicants from your country.</p><CompanyResearchPanel investigation={investigation}/></main></SiteShell>
}
