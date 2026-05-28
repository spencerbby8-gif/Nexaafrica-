import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '/vercel/share/.env.project' })

import { fetchGreenhouseJobs } from '../lib/ingest/sources/greenhouse'
import { fetchLeverJobs } from '../lib/ingest/sources/lever'
import { fetchAshbyJobs } from '../lib/ingest/sources/ashby'
import { validateNormalizedJob } from '../lib/ingest/validate'

async function diag(label: string, fn: () => Promise<any[]>) {
  console.log(`\n=== ${label} ===`)
  let jobs: any[] = []
  try {
    jobs = await fn()
  } catch (e: any) {
    console.log('FETCH ERROR:', e.message)
    return
  }
  console.log(`fetched: ${jobs.length}`)
  if (jobs.length === 0) return
  console.log('--- sample raw normalized job ---')
  console.log(JSON.stringify(jobs[0], null, 2).slice(0, 1500))
  const reasons: Record<string, number> = {}
  let pass = 0
  for (const j of jobs) {
    const r = validateNormalizedJob(j)
    if (r.ok) pass++
    else reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
  }
  console.log(`passed: ${pass} / ${jobs.length}`)
  console.log('rejection reasons:', reasons)
}

await diag('Greenhouse / gitlab', () => fetchGreenhouseJobs('gitlab', 'GitLab'))
await diag('Lever / netlify', () => fetchLeverJobs('netlify', 'Netlify'))
await diag('Ashby / vercel', () => fetchAshbyJobs('vercel', 'Vercel'))
