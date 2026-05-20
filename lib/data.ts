import type { Job, Category } from './types'

export const categories: Category[] = [
  { slug: 'engineering', label: 'Engineering', description: 'Software, infrastructure, mobile.' },
  { slug: 'design', label: 'Design', description: 'Product, brand, and UX design.' },
  { slug: 'product', label: 'Product', description: 'Product management and strategy.' },
  { slug: 'marketing', label: 'Marketing', description: 'Growth, content, and brand.' },
  { slug: 'sales', label: 'Sales', description: 'Sales and partnerships.' },
  { slug: 'support', label: 'Support', description: 'Customer support and success.' },
  { slug: 'data', label: 'Data', description: 'Analytics, ML, and data engineering.' },
  { slug: 'operations', label: 'Operations', description: 'People, finance, and ops.' },
]

export const jobs: Job[] = [
  {
    id: '1',
    slug: 'senior-frontend-engineer-linear-clone',
    title: 'Senior Frontend Engineer',
    company: 'Mercator',
    category: 'engineering',
    country: 'worldwide',
    location: 'Remote · Worldwide',
    remote: true,
    salaryMin: 90000,
    salaryMax: 140000,
    currency: 'USD',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    preview:
      'Build the next generation of mapping tools used by logistics teams across three continents.',
    description: `## About the role

We are looking for a senior frontend engineer to lead our web platform. You will work closely with design and product on a small, focused team.

## What you will do
- Own significant parts of the web application
- Collaborate with design on a shared system
- Improve performance and accessibility

## Requirements
- 5+ years building production web apps
- Strong TypeScript and React experience
- Comfortable working asynchronously across time zones
`,
    tags: ['React', 'TypeScript', 'Next.js'],
    verified: true,
  },
  {
    id: '2',
    slug: 'product-designer-fintech',
    title: 'Product Designer',
    company: 'Northwind',
    category: 'design',
    country: 'emea',
    location: 'Remote · EMEA',
    remote: true,
    salaryMin: 70000,
    salaryMax: 95000,
    currency: 'USD',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    preview:
      'Shape end-to-end product flows for a cross-border payments platform serving SMBs.',
    description: `## About Northwind

Northwind builds cross-border payment infrastructure. We are a calm, senior team.

## Requirements
- 4+ years of product design experience
- Strong portfolio across web and mobile
- Comfort with ambiguity
`,
    tags: ['Figma', 'Product Design', 'Fintech'],
    verified: true,
  },
  {
    id: '3',
    slug: 'backend-engineer-go',
    title: 'Backend Engineer, Go',
    company: 'Klar',
    category: 'engineering',
    country: 'worldwide',
    location: 'Remote · Worldwide',
    remote: true,
    salaryMin: 80000,
    salaryMax: 120000,
    currency: 'USD',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    preview: 'Work on high-throughput services that power messaging for thousands of teams.',
    description: `## The team

A small, distributed engineering team operating across four time zones.

## Requirements
- Production Go experience
- Comfort with Postgres and event-driven systems
`,
    tags: ['Go', 'Postgres', 'Distributed Systems'],
    verified: true,
  },
  {
    id: '4',
    slug: 'growth-marketer-saas',
    title: 'Growth Marketer',
    company: 'Atlas Labs',
    category: 'marketing',
    country: 'worldwide',
    location: 'Remote · Worldwide',
    remote: true,
    salaryMin: 55000,
    salaryMax: 85000,
    currency: 'USD',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString(),
    preview:
      'Own paid and organic growth experiments for a developer-focused SaaS approaching Series A.',
    description: `## What you will do
- Run end-to-end growth experiments
- Partner with content and product
- Report on weekly performance
`,
    tags: ['Growth', 'SEO', 'B2B SaaS'],
    verified: false,
  },
  {
    id: '5',
    slug: 'data-analyst-marketplace',
    title: 'Data Analyst',
    company: 'Harbor',
    category: 'data',
    country: 'worldwide',
    location: 'Remote · Worldwide',
    remote: true,
    salaryMin: 60000,
    salaryMax: 90000,
    currency: 'USD',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
    preview: 'Join a marketplace data team focused on supply, demand, and pricing analytics.',
    description: `## Requirements
- Strong SQL and Python
- Experience with marketplaces or two-sided platforms
`,
    tags: ['SQL', 'Python', 'dbt'],
    verified: true,
  },
  {
    id: '6',
    slug: 'customer-support-lead',
    title: 'Customer Support Lead',
    company: 'Lumen',
    category: 'support',
    country: 'worldwide',
    location: 'Remote · Worldwide',
    remote: true,
    salaryMin: 45000,
    salaryMax: 65000,
    currency: 'USD',
    postedAt: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
    preview: 'Lead a small support team focused on technical onboarding and customer health.',
    description: `## Requirements
- 3+ years in technical customer support
- Experience leading a small team
`,
    tags: ['Support', 'Leadership'],
    verified: true,
  },
]

export function getJobBySlug(slug: string): Job | undefined {
  return jobs.find((j) => j.slug === slug)
}

export function getJobsByCategoryAndCountry(category: string, country: string): Job[] {
  return jobs.filter(
    (j) =>
      j.category === category &&
      (country === 'worldwide' ? true : j.country === country),
  )
}

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug)
}
