export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'

export interface Job {
  id: string
  slug: string
  title: string
  company: string
  company_logo: string | null
  description_md: string
  apply_url: string
  category: string
  location: string | null
  country: string
  salary_range: string | null
  employment_type: EmploymentType
  tags: string[]
  is_remote: boolean
  is_open_to_africa: boolean
  created_at: string
  expires_at: string | null
}

export interface Category {
  slug: string
  title: string
  description: string | null
}

export interface Company {
  id: string
  name: string
  logo: string | null
  website: string | null
  description: string | null
  verified: boolean
}

export interface JobFilters {
  category?: string
  country?: string
  remoteOnly?: boolean
  openToAfrica?: boolean
  employmentType?: EmploymentType
  q?: string
  limit?: number
  freshDays?: number
}
