/**
 * Company Website Collector
 * Verifies that the company has a website and checks its quality
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType } from '../types'
import type { Job } from '@/lib/types'

export class CompanyWebsiteCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'company_website'
  
  async collect(job: Job): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      // Get company website URL
      // Note: company_website is not available on Job type, only on JobWithIntelligence
      // Try to infer from company name
      const websiteUrl = this.inferWebsiteUrl(job)
      
      if (!websiteUrl) {
        return this.createEvidence(
          job,
          {
            website_found: false,
            reason: 'No company website provided or inferred',
          },
          'failed',
          0,
          'No company website found',
          undefined,
          'Company Website Check'
        )
      }
      
      // Check if website is accessible
      const accessibility = await this.checkUrlAccessible(websiteUrl, 8000)
      
      if (!accessibility.accessible) {
        return this.createEvidence(
          job,
          {
            website_found: true,
            website_url: websiteUrl,
            website_accessible: false,
            status_code: accessibility.status,
            error: accessibility.error,
          },
          'failed',
          20,
          `Company website found but not accessible: ${accessibility.error || `HTTP ${accessibility.status}`}`,
          websiteUrl,
          'Company Website Check'
        )
      }
      
      // Fetch website content
      const htmlResult = await this.fetchHtml(websiteUrl, 8000)
      
      if (!htmlResult.success || !htmlResult.html) {
        return this.createEvidence(
          job,
          {
            website_found: true,
            website_url: websiteUrl,
            website_accessible: true,
            content_fetched: false,
            error: htmlResult.error,
          },
          'partial',
          40,
          'Company website accessible but could not fetch content',
          websiteUrl,
          'Company Website Check'
        )
      }
      
      const html = htmlResult.html
      
      // Check for job mentions
      const jobMentioned = this.checkJobMentioned(html, job)
      
      // Check for company name mentions
      const companyMentioned = this.checkCompanyMentioned(html, job.company)
      
      // Check for SSL certificate (HTTPS)
      const hasSSL = websiteUrl.startsWith('https://')
      
      // Check for common quality indicators
      const qualityIndicators = this.checkQualityIndicators(html)
      
      // Calculate confidence
      const confidence = this.calculateConfidence([
        { value: accessibility.accessible, weight: 30 },
        { value: jobMentioned, weight: 25 },
        { value: companyMentioned, weight: 20 },
        { value: hasSSL, weight: 15 },
        { value: qualityIndicators.score, weight: 10 },
      ])
      
      // Determine verification status
      const status = accessibility.accessible && (jobMentioned || companyMentioned)
        ? 'verified'
        : accessibility.accessible
        ? 'partial'
        : 'failed'
      
      // Create summary
      const summaryParts = []
      if (jobMentioned) summaryParts.push('job mentioned')
      if (companyMentioned) summaryParts.push('company mentioned')
      if (hasSSL) summaryParts.push('SSL secured')
      if (qualityIndicators.hasAbout) summaryParts.push('has about page')
      if (qualityIndicators.hasContact) summaryParts.push('has contact page')
      
      const summary = summaryParts.length > 0
        ? `Company website verified: ${summaryParts.join(', ')}`
        : 'Company website accessible but limited verification'
      
      return this.createEvidence(
        job,
        {
          website_found: true,
          website_url: websiteUrl,
          website_accessible: true,
          content_fetched: true,
          content_length: html.length,
          job_mentioned: jobMentioned,
          company_mentioned: companyMentioned,
          has_ssl: hasSSL,
          quality_indicators: qualityIndicators,
          check_duration_ms: Date.now() - startTime,
        },
        status,
        confidence,
        summary,
        websiteUrl,
        'Company Website Check'
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
        `Company website check failed: ${error.message}`,
        undefined,
        'Company Website Check'
      )
    }
  }
  
  /**
   * Infer company website from company name
   */
  private inferWebsiteUrl(job: Job): string | null {
    if (!job.company) return null
    
    // Simple inference: company.com
    const companyName = job.company.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 30)
    
    if (companyName.length < 3) return null
    
    return `https://${companyName}.com`
  }
  
  /**
   * Check if job title is mentioned on the website
   */
  private checkJobMentioned(html: string, job: Job): boolean {
    const lowerHtml = html.toLowerCase()
    const jobTitle = job.title.toLowerCase()
    
    // Check for exact title match
    if (lowerHtml.includes(jobTitle)) {
      return true
    }
    
    // Check for key words from job title
    const titleWords = jobTitle.split(/\s+/).filter(w => w.length > 3)
    const matchCount = titleWords.filter(word => lowerHtml.includes(word)).length
    
    return matchCount >= Math.min(3, titleWords.length * 0.6)
  }
  
  /**
   * Check if company name is mentioned on the website
   */
  private checkCompanyMentioned(html: string, companyName: string): boolean {
    const lowerHtml = html.toLowerCase()
    const lowerCompany = companyName.toLowerCase()
    
    return lowerHtml.includes(lowerCompany)
  }
  
  /**
   * Check for common quality indicators
   */
  private checkQualityIndicators(html: string): {
    score: number
    hasAbout: boolean
    hasContact: boolean
    hasCareers: boolean
    hasPrivacy: boolean
    hasTerms: boolean
  } {
    const lowerHtml = html.toLowerCase()
    
    const hasAbout = lowerHtml.includes('about') || lowerHtml.includes('about us')
    const hasContact = lowerHtml.includes('contact') || lowerHtml.includes('contact us')
    const hasCareers = lowerHtml.includes('careers') || lowerHtml.includes('jobs')
    const hasPrivacy = lowerHtml.includes('privacy') || lowerHtml.includes('privacy policy')
    const hasTerms = lowerHtml.includes('terms') || lowerHtml.includes('terms of service')
    
    let score = 0
    if (hasAbout) score += 25
    if (hasContact) score += 25
    if (hasCareers) score += 20
    if (hasPrivacy) score += 15
    if (hasTerms) score += 15
    
    return {
      score,
      hasAbout,
      hasContact,
      hasCareers,
      hasPrivacy,
      hasTerms,
    }
  }
}
