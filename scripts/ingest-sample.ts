/**
 * Sample ingestion script.
 *
 * Usage:
 *   INGEST_URL=https://your-app.vercel.app/api/ingest \
 *   INGEST_TOKEN=xxxxx \
 *   pnpm tsx scripts/ingest-sample.ts
 */

const url = process.env.INGEST_URL ?? 'http://localhost:3000/api/ingest'
const token = process.env.INGEST_TOKEN

if (!token) {
  console.error('Missing INGEST_TOKEN')
  process.exit(1)
}

const jobs = [
  {
    title: 'Staff Software Engineer',
    company: 'Stripe',
    description_md:
      '## About the role\n\nStripe is hiring a Staff Software Engineer to work on payments infrastructure used by millions of businesses.\n\n## Responsibilities\n\n- Design and own large parts of payments systems.\n- Mentor engineers across teams.\n- Drive reliability and performance.',
    apply_url: 'https://stripe.com/jobs',
    category: 'engineering',
    location: 'Remote',
    country: 'Global',
    salary_range: '$200k - $260k',
    employment_type: 'full_time',
    tags: ['payments', 'distributed-systems', 'staff'],
    is_remote: true,
    is_open_to_africa: true,
    source: 'manual',
    source_id: 'stripe-staff-eng-1',
  },
  {
    title: 'Brand Designer',
    company: 'Notion',
    description_md:
      '## About the role\n\nNotion is hiring a Brand Designer to shape how we show up in the world.\n\n## Responsibilities\n\n- Lead campaigns across web and product surfaces.\n- Collaborate with marketing and product design.\n- Maintain brand systems.',
    apply_url: 'https://notion.so/careers',
    category: 'design',
    location: 'Remote',
    country: 'Global',
    salary_range: '$120k - $160k',
    employment_type: 'full_time',
    tags: ['brand', 'visual-design'],
    is_remote: true,
    is_open_to_africa: true,
    source: 'manual',
    source_id: 'notion-brand-1',
  },
]

async function main() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobs }),
  })
  const json = await res.json()
  console.log(`[ingest] status=${res.status}`, json)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
