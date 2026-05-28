import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '/vercel/share/.env.project' })

import { fetchGreenhouse } from '../lib/ingest/sources/greenhouse'
import { fetchLever } from '../lib/ingest/sources/lever'
import { fetchAshby } from '../lib/ingest/sources/ashby'
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
    if (r === null) pass++
    else reasons[r] = (reasons[r] ?? 0) + 1
  }
  console.log(`passed: ${pass} / ${jobs.length}`)
  console.log('rejection reasons:', reasons)
}

async function main() {
  await diag('Greenhouse / gitlab', () => fetchGreenhouse('gitlab', 'GitLab'))
  await diag('Lever / netlify', () => fetchLever('netlify', 'Netlify'))
  await diag('Ashby / vercel', () => fetchAshby('vercel', 'Vercel'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
