import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobDetailLayout } from '@/components/job-detail-layout'
import { getJobBySlug, getRelatedJobs } from '@/lib/queries'

export const revalidate = 600

type Params = { slug: string }

const employmentSchemaMap: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
}

function firstParagraph(md: string): string {
  const block = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('-'))
  return block ?? ''
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  if (!job) return {}
  const description = firstParagraph(job.description_md).slice(0, 200)
  const title = `${job.title} at ${job.company}`
  return {
    title,
    description,
    alternates: { canonical: `/role/${job.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/role/${job.slug}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function RolePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  if (!job) notFound()

  const related = await getRelatedJobs(job, 4)
  const description = firstParagraph(job.description_md)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: description || job.title,
    datePosted: job.created_at,
    ...(job.expires_at ? { validThrough: job.expires_at } : {}),
    employmentType: employmentSchemaMap[job.employment_type] ?? 'FULL_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      ...(job.company_logo ? { logo: job.company_logo } : {}),
    },
    jobLocationType: job.is_remote ? 'TELECOMMUTE' : undefined,
    applicantLocationRequirements: {
      '@type': 'Country',
      name: job.country,
    },
    directApply: false,
    url: job.apply_url,
  }

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <JobDetailLayout job={job} related={related} />
    </SiteShell>
  )
}
