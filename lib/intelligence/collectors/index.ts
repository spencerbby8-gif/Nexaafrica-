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
export { CompanyReputationCollector } from './company-reputation'

// Collector registry
import { BaseEvidenceCollector } from './base'
import { CompanyWebsiteCollector } from './company-website'
import { ATSDataCollector } from './ats-data'
import { CareerPageCollector } from './career-page'
import { DomainQualityCollector } from './domain-quality'
import { BrokenLinksCollector } from './broken-links'
import { DuplicateDetectionCollector } from './duplicate-detection'
import { SalaryRealismCollector } from './salary-realism'
import { CompanyReputationCollector } from './company-reputation'
import type { EvidenceType } from '../types'

export const COLLECTOR_REGISTRY: Record<EvidenceType, new () => BaseEvidenceCollector> = {
  company_website: CompanyWebsiteCollector,
  ats_data: ATSDataCollector,
  career_page: CareerPageCollector,
  domain_quality: DomainQualityCollector,
  broken_links: BrokenLinksCollector,
  duplicate_detection: DuplicateDetectionCollector,
  salary_realism: SalaryRealismCollector,
  company_reputation: CompanyReputationCollector,
  hiring_regions: CareerPageCollector, // Placeholder - TODO: Implement dedicated collector
  visa_support: CareerPageCollector, // Placeholder - TODO: Implement dedicated collector
  eor_payroll: CareerPageCollector, // Placeholder - TODO: Implement dedicated collector
  prior_intelligence: CompanyWebsiteCollector, // Placeholder - TODO: Implement dedicated collector
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
