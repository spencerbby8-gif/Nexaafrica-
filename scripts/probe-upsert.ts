import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '/vercel/share/.env.project' })

import { fetchGreenhouse } from '../lib/ingest/sources/greenhouse'
import { createServiceClient } from '../lib/supabase/service'
import { buildJobSlug } from '../lib/slug'

async function main() {
  const jobs = await fetchGreenhouse('gitlab', 'GitLab')
  console.log('[v0] fetched', jobs.length)
  const j = jobs[0]
  const slug = buildJobSlug(j.title, j.company, j.country)
  const row = {
    slug,
    title: j.title,
    company: j.company,
    company_logo: j.company_logo,
    description_md: j.description_md,
    apply_url: j.apply_url,
    category: j.category,
    location: j.location,
    country: j.country,
    salary_range: j.salary_range,
    employment_type: j.employment_type,
    tags: j.tags,
    is_remote: j.is_remote,
    is_open_to_africa: j.is_open_to_africa,
    source: j.source,
    source_id: j.source_id,
    expires_at: j.expires_at,
    is_active: true,
  }
  console.log('[v0] row keys:', Object.keys(row))
  console.log('[v0] category:', row.category, 'employment_type:', row.employment_type)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('jobs')
    .upsert(row, { onConflict: 'source,source_id' })
    .select('id')
  console.log('[v0] data:', data)
  console.log('[v0] error:', error)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
