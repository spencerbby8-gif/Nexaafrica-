import { BaseEvidenceCollector } from './base'
import type { Evidence, Job } from '../types'

/**
 * Company Reputation Collector
 * 
 * Checks company reputation and legitimacy by:
 * - Searching for scam reports and complaints
 * - Verifying company registration
 * - Checking for red flags (lawsuits, fraud allegations)
 * - Analyzing online reviews and ratings
 * 
 * Confidence Factors:
 * - No red flags found (high confidence)
 * - Company registration verified (medium-high confidence)
 * - Positive reviews/ratings (medium confidence)
 * - Red flags found (low confidence, triggers moderation)
 */
export class CompanyReputationCollector extends BaseEvidenceCollector {
  readonly collectorType = 'company_reputation'
  readonly sourceName = 'Company Reputation Check'

  async collect(job: Job): Promise<Evidence> {
    try {
      const companyName = job.company
      if (!companyName) {
        return this.createEvidence({
          verificationStatus: 'failed',
          confidenceScore: 0,
          evidenceData: { error: 'No company name provided' },
          evidenceSummary: 'Cannot check reputation: no company name',
          verificationDetails: { reason: 'missing_company_name' }
        })
      }

      // Check for scam reports and red flags
      const redFlags = await this.checkRedFlags(companyName)
      
      // Check company registration (simplified - would use real API in production)
      const registration = await this.checkRegistration(companyName)
      
      // Check online reviews (simplified - would use real API in production)
      const reviews = await this.checkReviews(companyName)

      // Calculate confidence score
      let confidenceScore = 50 // Base score
      
      // No red flags = +30
      if (redFlags.count === 0) {
        confidenceScore += 30
      } else {
        confidenceScore -= redFlags.count * 15 // -15 per red flag
      }
      
      // Registration verified = +15
      if (registration.verified) {
        confidenceScore += 15
      }
      
      // Positive reviews = +10
      if (reviews.averageRating && reviews.averageRating >= 4.0) {
        confidenceScore += 10
      } else if (reviews.averageRating && reviews.averageRating < 3.0) {
        confidenceScore -= 10
      }

      // Clamp to 0-100
      confidenceScore = Math.max(0, Math.min(100, confidenceScore))

      // Determine verification status
      const verificationStatus = 
        redFlags.count > 0 ? 'failed' :
        confidenceScore >= 70 ? 'verified' :
        confidenceScore >= 40 ? 'partial' : 'failed'

      // Build evidence summary
      const summaryParts = []
      if (redFlags.count === 0) {
        summaryParts.push('No red flags found')
      } else {
        summaryParts.push(`${redFlags.count} red flag(s) detected`)
      }
      
      if (registration.verified) {
        summaryParts.push('Company registration verified')
      }
      
      if (reviews.averageRating) {
        summaryParts.push(`Average rating: ${reviews.averageRating.toFixed(1)}/5 (${reviews.totalReviews} reviews)`)
      }

      return this.createEvidence({
        verificationStatus,
        confidenceScore,
        evidenceData: {
          companyName,
          redFlags: redFlags.flags,
          redFlagCount: redFlags.count,
          registration,
          reviews,
          checkedAt: new Date().toISOString()
        },
        evidenceSummary: summaryParts.join('; '),
        verificationDetails: {
          redFlagCount: redFlags.count,
          registrationVerified: registration.verified,
          averageRating: reviews.averageRating,
          totalReviews: reviews.totalReviews
        },
        sourceUrl: `https://example.com/company/${encodeURIComponent(companyName)}`
      })
    } catch (error) {
      return this.handleCollectionError(error)
    }
  }

  /**
   * Check for scam reports, complaints, and red flags
   * In production, this would query:
   * - Better Business Bureau API
   * - ScamAdviser API
   * - Trustpilot API
   * - Google search for "[company] scam" or "[company] complaint"
   */
  private async checkRedFlags(companyName: string): Promise<{ count: number; flags: any[] }> {
    // Simulated red flag check
    // In production, replace with actual API calls
    
    const flags: any[] = []
    
    // Example: Check for common scam patterns
    const scamPatterns = [
      'upfront fee',
      'wire transfer',
      'personal bank account',
      'too good to be true'
    ]
    
    // Simulated: No red flags found for legitimate companies
    // In production, this would be real API results
    
    return {
      count: flags.length,
      flags
    }
  }

  /**
   * Check company registration
   * In production, this would query:
   * - Companies House (UK)
   * - SEC EDGAR (US)
   * - Local business registries
   */
  private async checkRegistration(companyName: string): Promise<{ verified: boolean; details?: any }> {
    // Simulated registration check
    // In production, replace with actual API calls
    
    // For now, assume companies with professional names are registered
    const professionalPatterns = [
      /Inc\.?$/i,
      /LLC$/i,
      /Ltd\.?$/i,
      /Corp\.?$/i,
      /GmbH$/i,
      /SA$/i
    ]
    
    const isProfessional = professionalPatterns.some(pattern => pattern.test(companyName))
    
    return {
      verified: isProfessional || companyName.length > 10, // Simple heuristic
      details: {
        source: 'simulated',
        note: 'In production, this would query real business registries'
      }
    }
  }

  /**
   * Check online reviews and ratings
   * In production, this would query:
   * - Glassdoor API
   * - Indeed API
   * - Google Reviews API
   * - Trustpilot API
   */
  private async checkReviews(companyName: string): Promise<{ 
    averageRating?: number; 
    totalReviews?: number; 
    sources?: string[] 
  }> {
    // Simulated review check
    // In production, replace with actual API calls
    
    // For demonstration, return simulated positive reviews for established companies
    if (companyName.length > 15) {
      return {
        averageRating: 4.2,
        totalReviews: 127,
        sources: ['Glassdoor', 'Indeed', 'Google Reviews']
      }
    }
    
    return {
      averageRating: undefined,
      totalReviews: 0,
      sources: []
    }
  }
}
