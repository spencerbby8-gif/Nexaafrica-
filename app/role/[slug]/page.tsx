import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobDetailLayout } from '@/components/job-detail-layout'
import { getJobBySlug, jobs } from '@/lib/data'

type Params = { slug: string }

export async function generateStaticParams() {
  return jobs.map((j) => ({ slug: j.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const job = getJobBySlug(slug)
  if (!job) return {}
  return {
    title: `${job.title} at ${job.company}`,
    description: job.preview,
    alternates: { canonical: `/role/${job.slug}` },
    openGraph: {
      title: `${job.title} at ${job.company}`,
      description: job.preview,
      type: 'article',
    },
  }
}

export default async function RolePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const job = getJobBySlug(slug)
  if (!job) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.preview,
    datePosted: job.postedAt,
    employmentType: 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: job.company },
    jobLocationType: 'TELECOMMUTE',
    applicantLocationRequirements: {
      '@type': 'Country',
      name: job.country === 'worldwide' ? 'Worldwide' : job.country,
    },
    ...(job.salaryMin && job.salaryMax
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.currency ?? 'USD',
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salaryMin,
              maxValue: job.salaryMax,
              unitText: 'YEAR',
            },
          },
        }
      : {}),
  }

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <JobDetailLayout job={job} />
    </SiteShell>
  )
}
