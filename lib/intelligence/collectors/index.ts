/**
 * Evidence Collectors - Index
 * Exports all evidence collectors
 */

export { BaseEvidenceCollector } from './base'
export { CompanyWebsiteCollector } from './company-website'
export { ATSDataCollector } from './ats-data'
export { CareerPageCollector } from './career-page'
export { DomainQualityCollector } from './domain-quality'
export { BrokenLinksCollector } from './broken-links'
export { DuplicateDetectionCollector } from './duplicate-detection'
export { SalaryRealismCollector } from './salary-realism'

// Collector registry
import { BaseEvidenceCollector } from './base'
import { CompanyWebsiteCollector } from './company-website'
import { ATSDataCollector } from './ats-data'
import { CareerPageCollector } from './career-page'
import { DomainQualityCollector } from './domain-quality'
import { BrokenLinksCollector } from './broken-links'
import { DuplicateDetectionCollector } from './duplicate-detection'
import { SalaryRealismCollector } from './salary-realism'
import type { EvidenceType } from '../types'

export const COLLECTOR_REGISTRY: Record<EvidenceType, new () => BaseEvidenceCollector> = {
  company_website: CompanyWebsiteCollector,
  ats_data: ATSDataCollector,
  career_page: CareerPageCollector,
  domain_quality: DomainQualityCollector,
  broken_links: BrokenLinksCollector,
  duplicate_detection: DuplicateDetectionCollector,
  salary_realism: SalaryRealismCollector,
  // Additional collectors will be added here
  company_reputation: CompanyWebsiteCollector, // Placeholder
  hiring_regions: CareerPageCollector, // Placeholder
  visa_support: CareerPageCollector, // Placeholder
  eor_payroll: CareerPageCollector, // Placeholder
  prior_intelligence: CompanyWebsiteCollector, // Placeholder
}

/**
 * Get collector instance for a given evidence type
 */
export function getCollector(type: EvidenceType): BaseEvidenceCollector | null {
  const CollectorClass = COLLECTOR_REGISTRY[type]
  if (!CollectorClass) return null
  return new CollectorClass()
}

/**
 * Get all available collectors
 */
export function getAllCollectors(): BaseEvidenceCollector[] {
  const uniqueCollectors = new Set(Object.values(COLLECTOR_REGISTRY))
  return Array.from(uniqueCollectors).map(CollectorClass => new CollectorClass())
}
