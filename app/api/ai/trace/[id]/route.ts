import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cleanDescription } from '@/lib/cleanDescription'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return true
  return req.headers.get('authorization') === `Bearer ${token}`
}

// Log external requests
const externalRequests: any[] = []

async function loggedFetch(url: string, options?: any): Promise<Response> {
  const start = Date.now()
  const entry: any = { url, method: options?.method || 'GET', start: new Date().toISOString(), headers: options?.headers || {} }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    const elapsed = Date.now() - start
    const clone = res.clone()
    const text = await clone.text().catch(() => '')
    entry.status = res.status
    entry.ok = res.ok
    entry.elapsedMs = elapsed
    entry.htmlLength = text.length
    entry.textSnippet = text.slice(0, 500)
    externalRequests.push(entry)
    // Return original-like response with text
    return new Response(text, { status: res.status, headers: res.headers })
  } catch (e) {
    const elapsed = Date.now() - start
    entry.error = e instanceof Error ? e.message : String(e)
    entry.elapsedMs = elapsed
    entry.ok = false
    externalRequests.push(entry)
    throw e
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  externalRequests.length = 0

  // 1. Database row
  const { data: job, error: jobError } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle()
  if (jobError || !job) return NextResponse.json({ error: 'Job not found', jobError }, { status: 404 })

  const trace: any = {
    step1_databaseRow: job,
    step2_originalAtsUrl: job.apply_url,
    steps: [],
  }

  // 2-8. Fetch job page and company page
  let jobPageHtml = ''
  let jobPageParsed = ''
  let companyPageHtml = ''
  let companyPageParsed = ''
  let salaryPageHtml = ''

  try {
    console.log(`[TRACE] Fetching job page ${job.apply_url}`)
    const res = await loggedFetch(job.apply_url, { headers: { 'User-Agent': 'Nexa Trace Bot' } })
    if (res.ok) {
      jobPageHtml = await res.text()
      jobPageParsed = cleanDescription(jobPageHtml).slice(0, 5000)
      trace.steps.push({
        step: '3-4-5-6 Job page fetched',
        url: job.apply_url,
        htmlLength: jobPageHtml.length,
        parsedLength: jobPageParsed.length,
        parsedSnippet: jobPageParsed.slice(0, 500),
        containsSalary: /\$\d|€\d|£\d|USD|salary/i.test(jobPageHtml),
      })
    }
  } catch (e) {
    trace.steps.push({ step: 'Job page fetch failed', error: e instanceof Error ? e.message : String(e) })
  }

  // Try company domain
  let companyDomain: string | null = null
  try {
    const url = new URL(job.apply_url)
    if (!url.hostname.includes('greenhouse.io') && !url.hostname.includes('lever.co') && !url.hostname.includes('ashbyhq.com')) {
      companyDomain = `${url.protocol}//${url.hostname}`
      const companyUrl = companyDomain
      try {
        const res = await loggedFetch(companyUrl, { headers: { 'User-Agent': 'Nexa Trace Bot' } })
        if (res.ok) {
          companyPageHtml = await res.text()
          companyPageParsed = cleanDescription(companyPageHtml).slice(0, 3000)
          trace.steps.push({
            step: '7 Company page fetched',
            url: companyUrl,
            htmlLength: companyPageHtml.length,
            parsedLength: companyPageParsed.length,
            parsedSnippet: companyPageParsed.slice(0, 300),
          })
        }
      } catch (e) {
        trace.steps.push({ step: 'Company page fetch failed', url: companyDomain, error: e instanceof Error ? e.message : String(e) })
      }
    } else {
      trace.steps.push({ step: 'Company page skipped – ATS host', atsHost: url.hostname })
    }
  } catch {}

  // Salary page – for this trace, job page is salary page if contains salary
  if (jobPageHtml) {
    const hasSalaryInHtml = /\$[\d,]+|€[\d,]+|£[\d,]+|USD\s*\d/i.test(jobPageHtml)
    trace.steps.push({
      step: '8 Salary page check',
      hasSalaryInHtml,
      jobSalaryRange: job.salary_range,
      jobSalaryMin: job.salary_min,
      jobSalaryMax: job.salary_max,
    })
  }

  // 9. Prompt sent to Gemini
  const combined = `${job.description_md}\n\n${jobPageParsed}`.slice(0, 8000)
  const prompts: any[] = []

  const africaPrompt = `Verify Africa eligibility for job: ${job.title} at ${job.company}. Location: ${job.location}. Description: ${combined.slice(0,3000)}. Return JSON with eligibility explicit/likely/restricted/unknown, confidence 0-100, evidence quote max 200 chars (verbatim from description), countryRestrictions, visaSponsorship. Never guess, return unknown when evidence missing. Evidence must be verbatim quote from description, not generic.`
  const remotePrompt = `Verify remote policy for job: ${job.title} at ${job.company}. Location: ${job.location}. Description: ${combined.slice(0,3000)}. Determine fully_remote/hybrid/onsite/unknown, timezone. Return JSON with eligibility, confidence, evidence quote verbatim.`
  const salaryPrompt = `Verify salary for job: ${job.title} at ${job.company}. Stored salary: ${job.salary_range || "none"}. Description: ${combined.slice(0,3000)}. Return JSON with min, max, currency, period, isEstimated, transparency disclosed/estimated/undisclosed/unknown, confidence, evidence quote verbatim from description where salary appears. Never invent salary. If fetched HTML contains salary but you claim undisclosed, that is failure.`

  prompts.push({ agent: 'verifier:africa-eligibility', prompt: africaPrompt })
  prompts.push({ agent: 'verifier:remote-policy', prompt: remotePrompt })
  prompts.push({ agent: 'verifier:salary', prompt: salaryPrompt })

  trace.step9_promptsSent = prompts

  // 10. Raw Gemini response – call gateway for each
  const gatewayResults: any[] = []
  try {
    const { aiGateway } = await import('@/lib/ai/gateway')
    for (const p of prompts) {
      try {
        const gw = await aiGateway({
          prompt: p.prompt,
          systemInstruction: 'You are evidence-based verifier. Never guess. Return UNKNOWN when missing. Evidence must be verbatim quote from description.',
          agentId: p.agent,
          jobId: job.id,
          temperature: 0.2,
          maxTokens: 500,
        })
        gatewayResults.push({
          agent: p.agent,
          provider: gw.response.provider,
          model: gw.response.model,
          latencyMs: gw.response.latencyMs,
          rawResponse: gw.response.text,
          fallbackUsed: gw.fallbackUsed,
          fallbackChain: gw.fallbackChain,
        })
      } catch (e) {
        gatewayResults.push({
          agent: p.agent,
          error: e instanceof Error ? e.message : String(e),
          fallback: true,
        })
      }
    }
  } catch (e) {
    trace.step10_error = e instanceof Error ? e.message : String(e)
  }

  trace.step10_rawGeminiResponses = gatewayResults

  // 11. Parsed JSON
  const parsed: any[] = []
  for (const gr of gatewayResults) {
    if (gr.rawResponse) {
      const m = gr.rawResponse.match(/\{[\s\S]*\}/)
      if (m) {
        try {
          const json = JSON.parse(m[0])
          parsed.push({ agent: gr.agent, json })
        } catch (e) {
          parsed.push({ agent: gr.agent, parseError: e instanceof Error ? e.message : String(e), raw: gr.rawResponse.slice(0,500) })
        }
      } else {
        parsed.push({ agent: gr.agent, parseError: 'No JSON found', raw: gr.rawResponse.slice(0,500) })
      }
    }
  }
  trace.step11_parsedJson = parsed

  // 12. Data written into job_ai_intelligence – call enrich and check what would be written
  let intelligence: any = null
  try {
    const { enrichJobWithAI } = await import('@/lib/ai/engine')
    const aiResult = await enrichJobWithAI(job as any)
    intelligence = aiResult.intelligence
    trace.step12_dataWritten = intelligence

    // Check failures
    const checks: any[] = []
    // Check salary undisclosed while HTML contains salary
    const htmlHasSalary = /\$[\d,]+/.test(jobPageHtml + combined)
    const salaryTrans = intelligence.salary?.value?.transparency || intelligence.salary?.transparency
    if (salaryTrans === 'undisclosed' && htmlHasSalary) {
      checks.push({ failure: 'Salary claimed undisclosed while HTML contains salary', htmlHasSalary, salaryTrans })
    }
    // Check source verified while no page fetched
    if (intelligence.company?.value === 'verified' && !companyPageHtml && !jobPageHtml) {
      checks.push({ failure: 'Source verified while no page fetched' })
    }
    // Check No evidence after research
    const allEvidence = [
      ...(intelligence.africa?.evidence || []),
      ...(intelligence.remote?.evidence || []),
      ...(intelligence.salary?.evidence || []),
    ]
    if (allEvidence.length === 0 && jobPageHtml) {
      // If page fetched but no evidence, check if it's UNKNOWN (acceptable) or claims verified
      if (intelligence.africa?.value !== 'unknown' || intelligence.remote?.value !== 'unknown') {
        checks.push({ warning: 'Claims non-unknown but no evidence after research', evidenceCount: allEvidence.length })
      }
    }
    // Check placeholder/fake evidence
    const placeholderPatterns = [/^No evidence$/i, /^Worldwide language$/i, /^Fully remote language$/i, /^Logo \+ trusted ATS$/i, /^Company logo present$/i, /^Africa explicitly mentioned$/i, /^Geographic restriction$/i]
    for (const ev of allEvidence) {
      const text = (ev as any).text || ev
      for (const pat of placeholderPatterns) {
        if (pat.test(text)) {
          checks.push({ failure: 'Placeholder/fake evidence persisted', evidence: text, pattern: pat.source })
        }
      }
    }
    trace.step12_checks = checks

    // Actually write to DB (upsert)
    const { data: existing } = await supabase.from('job_ai_intelligence').select('model_version').eq('job_id', job.id).maybeSingle()
    trace.step12_existingModelVersion = existing?.model_version || null

    const upsertData = {
      job_id: job.id,
      version: intelligence.version,
      model_version: intelligence.modelVersion,
      africa_eligibility: intelligence.africa.value,
      africa_confidence: intelligence.africa.confidence,
      africa_evidence: intelligence.africa.evidence[0]?.text || null,
      africa_source_urls: intelligence.africa.sourceUrls,
      remote_eligibility: intelligence.remote.value,
      remote_confidence: intelligence.remote.confidence,
      remote_evidence: intelligence.remote.evidence[0]?.text || null,
      salary_min: intelligence.salary.value.min,
      salary_max: intelligence.salary.value.max,
      salary_currency: intelligence.salary.value.currency,
      salary_transparency: intelligence.salary.value.transparency,
      salary_confidence: intelligence.salary.confidence,
      salary_evidence: intelligence.salary.evidence[0]?.text || null,
      company_legitimacy: intelligence.company.value,
      company_confidence: intelligence.company.confidence,
      job_quality: intelligence.quality.value,
      experience_level: intelligence.experience.value,
      overall_confidence: intelligence.overallConfidence,
      evidence_urls: intelligence.africa.sourceUrls,
      last_verified_at: new Date().toISOString(),
    }
    trace.step12_upsertData = upsertData

    // Do not actually write in trace mode? We will write to show, but we can skip if checks failed
    // For this trace, we WILL write to prove pipeline works, but log
    if (checks.some((c: any) => c.failure)) {
      trace.step12_writeSkippedDueToFailures = checks.filter((c: any) => c.failure)
    } else {
      const { error: upsertError } = await supabase.from('job_ai_intelligence').upsert(upsertData as any, { onConflict: 'job_id' })
      trace.step12_upsertResult = upsertError ? { error: upsertError.message } : { ok: true }
    }
  } catch (e) {
    trace.step12_error = e instanceof Error ? e.message : String(e)
  }

  // 13. Data returned by API
  try {
    const { data: aiRow } = await supabase.from('job_ai_intelligence').select('*').eq('job_id', job.id).maybeSingle()
    trace.step13_dataReturnedByApi = aiRow
  } catch (e) {
    trace.step13_error = e instanceof Error ? e.message : String(e)
  }

  // 14. Data rendered by UI – simulate what JobCard would show
  try {
    const { getAIIntelligenceForJob } = await import('@/lib/ai/queries')
    const aiForUI = await getAIIntelligenceForJob(job.id)
    trace.step14_dataRenderedByUI = {
      africaFit: aiForUI?.africa_eligibility,
      remote: aiForUI?.remote_eligibility,
      salary: `${aiForUI?.salary_min || ''}-${aiForUI?.salary_max || ''} ${aiForUI?.salary_currency || ''} trans=${aiForUI?.salary_transparency}`,
      company: aiForUI?.company_legitimacy,
      experience: aiForUI?.experience_level,
      confidence: aiForUI?.overall_confidence,
      evidence: aiForUI?.africa_evidence,
      model_version: aiForUI?.model_version,
      last_verified_at: aiForUI?.last_verified_at,
    }
  } catch (e) {
    trace.step14_error = e instanceof Error ? e.message : String(e)
  }

  trace.externalRequestsLog = externalRequests
  trace.summary = {
    totalExternalRequests: externalRequests.length,
    jobPageFetched: !!jobPageHtml,
    jobPageHtmlLength: jobPageHtml.length,
    companyPageFetched: !!companyPageHtml,
    companyPageHtmlLength: companyPageHtml.length,
    promptsSent: prompts.length,
    gatewayResponses: gatewayResults.length,
    parsedJsonCount: parsed.length,
    hasPlaceholderFailures: (trace.step12_checks || []).some((c: any) => c.failure),
  }

  return NextResponse.json(trace, { status: 200 })
}
