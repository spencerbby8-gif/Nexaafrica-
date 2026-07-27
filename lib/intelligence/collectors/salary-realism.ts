/**
 * Salary Realism Collector
 * Checks if salary range is realistic for the role and location
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType, JobWithIntelligence } from '../types'

export class SalaryRealismCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'salary_realism'
  
  // Salary ranges by role category (annual USD)
  private readonly SALARY_RANGES: Record<string, { min: number; max: number }> = {
    'software engineer': { min: 60000, max: 250000 },
    'senior software engineer': { min: 100000, max: 350000 },
    'staff engineer': { min: 150000, max: 500000 },
    'principal engineer': { min: 180000, max: 600000 },
    'engineering manager': { min: 130000, max: 400000 },
    'product manager': { min: 90000, max: 300000 },
    'senior product manager': { min: 130000, max: 400000 },
    'designer': { min: 60000, max: 200000 },
    'senior designer': { min: 90000, max: 280000 },
    'data scientist': { min: 80000, max: 250000 },
    'senior data scientist': { min: 120000, max: 350000 },
    'devops engineer': { min: 80000, max: 250000 },
    'senior devops engineer': { min: 120000, max: 350000 },
    'marketing manager': { min: 70000, max: 200000 },
    'sales representative': { min: 50000, max: 150000 },
    'account executive': { min: 70000, max: 200000 },
    'customer success': { min: 50000, max: 150000 },
    'technical writer': { min: 60000, max: 180000 },
    'qa engineer': { min: 60000, max: 180000 },
    'project manager': { min: 70000, max: 200000 },
    'default': { min: 40000, max: 300000 },
  }
  
  async collect(job: JobWithIntelligence): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      // Check if salary information is available
      if (!job.salary_min && !job.salary_max) {
        return this.createEvidence(
          job,
          {
            salary_available: false,
            reason: 'No salary information provided',
          },
          'pending',
          50,
          'No salary information available to verify',
          undefined,
          'Salary Realism Check'
        )
      }
      
      // Get expected salary range for role
      const roleCategory = this.categorizeRole(job.title)
      const expectedRange = this.SALARY_RANGES[roleCategory] || this.SALARY_RANGES['default']
      
      // Adjust for location (simplified)
      const locationMultiplier = this.getLocationMultiplier(job.location)
      const adjustedRange = {
        min: expectedRange.min * locationMultiplier,
        max: expectedRange.max * locationMultiplier,
      }
      
      // Check if job salary is within realistic range
      const jobSalaryMin = job.salary_min || job.salary_max! * 0.8
      const jobSalaryMax = job.salary_max || job.salary_min! * 1.2
      
      const isRealistic = this.checkSalaryRealism(
        jobSalaryMin,
        jobSalaryMax,
        adjustedRange.min,
        adjustedRange.max
      )
      
      // Calculate confidence
      const confidence = isRealistic.realistic ? 100 : Math.max(0, 100 - (isRealistic.deviation * 20))
      
      // Determine status
      const status = isRealistic.realistic
        ? 'verified'
        : isRealistic.deviation < 0.5
        ? 'partial'
        : 'failed'
      
      // Create summary
      const summary = isRealistic.realistic
        ? `Salary range $${jobSalaryMin.toLocaleString()}-$${jobSalaryMax.toLocaleString()} is realistic for ${roleCategory}`
        : `Salary range $${jobSalaryMin.toLocaleString()}-$${jobSalaryMax.toLocaleString()} ${isRealistic.tooLow ? 'below' : 'above'} expected range $${Math.round(adjustedRange.min).toLocaleString()}-$${Math.round(adjustedRange.max).toLocaleString()} for ${roleCategory}`
      
      return this.createEvidence(
        job,
        {
          salary_available: true,
          job_salary_min: jobSalaryMin,
          job_salary_max: jobSalaryMax,
          expected_min: Math.round(adjustedRange.min),
          expected_max: Math.round(adjustedRange.max),
          role_category: roleCategory,
          location_multiplier: locationMultiplier,
          is_realistic: isRealistic.realistic,
          too_low: isRealistic.tooLow,
          too_high: isRealistic.tooHigh,
          deviation: isRealistic.deviation,
          check_duration_ms: Date.now() - startTime,
        },
        status,
        confidence,
        summary,
        undefined,
        'Salary Realism Check'
      )
    } catch (error: any) {
      return this.createEvidence(
        job,
        {
          error: error.message || 'Unknown error',
          error_type: error.name || 'Error',
          check_duration_ms: Date.now() - startTime,
        },
        'failed',
        0,
        `Salary realism check failed: ${error.message}`,
        undefined,
        'Salary Realism Check'
      )
    }
  }
  
  /**
   * Categorize job title into role category
   */
  private categorizeRole(title: string): string {
    const lowerTitle = title.toLowerCase()
    
    // Engineering roles
    if (lowerTitle.includes('principal engineer') || lowerTitle.includes('principal software')) {
      return 'principal engineer'
    }
    if (lowerTitle.includes('staff engineer') || lowerTitle.includes('staff software')) {
      return 'staff engineer'
    }
    if (lowerTitle.includes('senior software') || lowerTitle.includes('sr. software') || lowerTitle.includes('sr software')) {
      return 'senior software engineer'
    }
    if (lowerTitle.includes('software engineer') || lowerTitle.includes('developer') || lowerTitle.includes('programmer')) {
      return 'software engineer'
    }
    if (lowerTitle.includes('engineering manager') || lowerTitle.includes('vp engineering') || lowerTitle.includes('director engineering')) {
      return 'engineering manager'
    }
    
    // DevOps roles
    if (lowerTitle.includes('senior devops') || lowerTitle.includes('sr. devops') || lowerTitle.includes('sr devops')) {
      return 'senior devops engineer'
    }
    if (lowerTitle.includes('devops') || lowerTitle.includes('site reliability') || lowerTitle.includes('sre')) {
      return 'devops engineer'
    }
    
    // Data roles
    if (lowerTitle.includes('senior data scientist') || lowerTitle.includes('sr. data scientist') || lowerTitle.includes('sr data scientist')) {
      return 'senior data scientist'
    }
    if (lowerTitle.includes('data scientist') || lowerTitle.includes('machine learning') || lowerTitle.includes('ml engineer')) {
      return 'data scientist'
    }
    
    // Product roles
    if (lowerTitle.includes('senior product manager') || lowerTitle.includes('sr. product manager') || lowerTitle.includes('sr product manager')) {
      return 'senior product manager'
    }
    if (lowerTitle.includes('product manager') || lowerTitle.includes('product owner')) {
      return 'product manager'
    }
    
    // Design roles
    if (lowerTitle.includes('senior designer') || lowerTitle.includes('sr. designer') || lowerTitle.includes('sr designer') || lowerTitle.includes('lead designer')) {
      return 'senior designer'
    }
    if (lowerTitle.includes('designer') || lowerTitle.includes('ux') || lowerTitle.includes('ui')) {
      return 'designer'
    }
    
    // QA roles
    if (lowerTitle.includes('qa') || lowerTitle.includes('quality assurance') || lowerTitle.includes('test engineer')) {
      return 'qa engineer'
    }
    
    // Marketing roles
    if (lowerTitle.includes('marketing manager') || lowerTitle.includes('marketing director') || lowerTitle.includes('vp marketing')) {
      return 'marketing manager'
    }
    
    // Sales roles
    if (lowerTitle.includes('account executive') || lowerTitle.includes('sales executive')) {
      return 'account executive'
    }
    if (lowerTitle.includes('sales') || lowerTitle.includes('business development')) {
      return 'sales representative'
    }
    
    // Customer success
    if (lowerTitle.includes('customer success') || lowerTitle.includes('customer support')) {
      return 'customer success'
    }
    
    // Technical writer
    if (lowerTitle.includes('technical writer') || lowerTitle.includes('documentation')) {
      return 'technical writer'
    }
    
    // Project manager
    if (lowerTitle.includes('project manager') || lowerTitle.includes('program manager')) {
      return 'project manager'
    }
    
    return 'default'
  }
  
  /**
   * Get location multiplier for salary adjustment
   */
  private getLocationMultiplier(location: string | undefined): number {
    if (!location) return 1.0
    
    const lowerLocation = location.toLowerCase()
    
    // High cost of living areas
    if (lowerLocation.includes('san francisco') || lowerLocation.includes('sf') || lowerLocation.includes('bay area')) {
      return 1.3
    }
    if (lowerLocation.includes('new york') || lowerLocation.includes('nyc')) {
      return 1.25
    }
    if (lowerLocation.includes('seattle')) {
      return 1.2
    }
    if (lowerLocation.includes('los angeles') || lowerLocation.includes('la')) {
      return 1.15
    }
    if (lowerLocation.includes('boston')) {
      return 1.15
    }
    
    // Medium cost of living areas
    if (lowerLocation.includes('austin') || lowerLocation.includes('denver') || lowerLocation.includes('portland')) {
      return 1.05
    }
    if (lowerLocation.includes('chicago') || lowerLocation.includes('atlanta') || lowerLocation.includes('dallas')) {
      return 1.0
    }
    
    // Lower cost of living areas
    if (lowerLocation.includes('remote') || lowerLocation.includes('anywhere')) {
      return 0.95
    }
    
    // International locations (simplified)
    if (lowerLocation.includes('london') || lowerLocation.includes('uk')) {
      return 0.9
    }
    if (lowerLocation.includes('canada') || lowerLocation.includes('toronto') || lowerLocation.includes('vancouver')) {
      return 0.85
    }
    if (lowerLocation.includes('europe') || lowerLocation.includes('germany') || lowerLocation.includes('berlin')) {
      return 0.8
    }
    
    return 1.0
  }
  
  /**
   * Check if salary is realistic
   */
  private checkSalaryRealism(
    jobMin: number,
    jobMax: number,
    expectedMin: number,
    expectedMax: number
  ): { realistic: boolean; tooLow: boolean; tooHigh: boolean; deviation: number } {
    // Check if job salary is completely outside expected range
    const tooLow = jobMax < expectedMin * 0.5
    const tooHigh = jobMin > expectedMax * 2.0
    
    // Calculate deviation from expected range
    let deviation = 0
    if (tooLow) {
      deviation = (expectedMin - jobMax) / expectedMin
    } else if (tooHigh) {
      deviation = (jobMin - expectedMax) / expectedMax
    }
    
    // Consider realistic if within 50% of expected range
    const realistic = !tooLow && !tooHigh && deviation < 0.5
    
    return {
      realistic,
      tooLow,
      tooHigh,
      deviation,
    }
  }
}
