export type JobCategory =
  | 'engineering'
  | 'design'
  | 'product'
  | 'marketing'
  | 'sales'
  | 'support'
  | 'data'
  | 'operations'

export type Currency = 'USD' | 'EUR' | 'GBP'

export interface Job {
  id: string
  slug: string
  title: string
  company: string
  companyLogo?: string
  category: JobCategory
  country: string // hiring region or "Worldwide"
  location: string
  remote: boolean
  salaryMin?: number
  salaryMax?: number
  currency?: Currency
  postedAt: string // ISO
  preview: string
  description: string // markdown
  tags: string[]
  verified: boolean
  applyUrl?: string
}

export interface Category {
  slug: JobCategory
  label: string
  description: string
}
