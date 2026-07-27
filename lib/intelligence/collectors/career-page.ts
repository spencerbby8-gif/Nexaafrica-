/**
 * Career Page Collector
 * Verifies that the company has a careers page and checks for job listings
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType, JobWithIntelligence } from '../types'

export class CareerPageCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'career_page'
  
  async collect(job: JobWithIntelligence): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      // Infer career page URL
      const careerPageUrl = this.inferCareerPageUrl(job)
      
      if (!careerPageUrl) {
        return this.createEvidence(
          job,
          {
            career_page_found: false,
            reason: 'Could not infer career page URL',
          },
          'failed',
          0,
          'No career page found',
          undefined,
          'Career Page Verification'
        )
      }
      
      // Check if career page is accessible
      const accessibility = await this.checkUrlAccessible(careerPageUrl, 8000)
      
      if (!accessibility.accessible) {
        // Try alternative URLs
        const alternativeUrls = this.getAlternativeCareerUrls(job)
        let foundAlternative = false
        let workingUrl = careerPageUrl
        
        for (const altUrl of alternativeUrls) {
          const altCheck = await this.checkUrlAccessible(altUrl, 5000)
          if (altCheck.accessible) {
            foundAlternative = true
            workingUrl = altUrl
            break
          }
        }
        
        if (!foundAlternative) {
          return this.createEvidence(
            job,
            {
              career_page_found: true,
              career_page_url: careerPageUrl,
              career_page_accessible: false,
              status_code: accessibility.status,
              error: accessibility.error,
              alternatives_tried: alternativeUrls.length,
            },
            'failed',
            20,
            `Career page found but not accessible: ${accessibility.error || `HTTP ${accessibility.status}`}`,
            careerPageUrl,
            'Career Page Verification'
          )
        }
        
        // Use the working alternative
        return this.analyzeCareerPage(job, workingUrl, startTime)
      }
      
      // Analyze the career page
      return this.analyzeCareerPage(job, careerPageUrl, startTime)
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
        `Career page verification failed: ${error.message}`,
        undefined,
        'Career Page Verification'
      )
    }
  }
  
  /**
   * Analyze career page content
   */
  private async analyzeCareerPage(job: JobWithIntelligence, careerPageUrl: string, startTime: number): Promise<Evidence> {
    // Fetch career page content
    const htmlResult = await this.fetchHtml(careerPageUrl, 8000)
    
    if (!htmlResult.success || !htmlResult.html) {
      return this.createEvidence(
        job,
        {
          career_page_found: true,
          career_page_url: careerPageUrl,
          career_page_accessible: true,
          content_fetched: false,
          error: htmlResult.error,
        },
        'partial',
        40,
        'Career page accessible but could not fetch content',
        careerPageUrl,
        'Career Page Verification'
      )
    }
    
    const html = htmlResult.html
    
    // Check if job is listed
    const jobListed = this.checkJobListed(html, job)
    
    // Check for company name
    const companyMentioned = this.checkCompanyMentioned(html, job.company)
    
    // Extract job listings count
    const jobListingsCount = this.countJobListings(html)
    
    // Check for hiring regions
    const hiringRegions = this.extractHiringRegions(html)
    
    // Check for remote work mentions
    const remoteMentions = this.checkRemoteMentions(html)
    
    // Check for diversity/inclusion mentions
    const diversityMentions = this.checkDiversityMentions(html)
    
    // Calculate confidence
    const confidence = this.calculateConfidence([
      { value: jobListed, weight: 40 },
      { value: companyMentioned, weight: 20 },
      { value: jobListingsCount > 0, weight: 20 },
      { value: remoteMentions.found, weight: 10 },
      { value: diversityMentions.found, weight: 10 },
    ])
    
    // Determine status
    const status = jobListed ? 'verified' : jobListingsCount > 0 ? 'partial' : 'failed'
    
    // Create summary
    const summaryParts = []
    if (jobListed) summaryParts.push('job listed')
    if (jobListingsCount > 0) summaryParts.push(`${jobListingsCount} jobs found`)
    if (remoteMentions.found) summaryParts.push('remote work mentioned')
    if (diversityMentions.found) summaryParts.push('diversity mentioned')
    if (hiringRegions.length > 0) summaryParts.push(`${hiringRegions.length} regions`)
    
    const summary = summaryParts.length > 0
      ? `Career page verified: ${summaryParts.join(', ')}`
      : 'Career page found but no job listings detected'
    
    return this.createEvidence(
      job,
      {
        career_page_found: true,
        career_page_url: careerPageUrl,
        career_page_accessible: true,
        content_fetched: true,
        content_length: html.length,
        job_listed: jobListed,
        company_mentioned: companyMentioned,
        job_listings_count: jobListingsCount,
        hiring_regions: hiringRegions,
        remote_mentions: remoteMentions,
        diversity_mentions: diversityMentions,
        check_duration_ms: Date.now() - startTime,
      },
      status,
      confidence,
      summary,
      careerPageUrl,
      'Career Page Verification'
    )
  }
  
  /**
   * Infer career page URL from company website
   */
  private inferCareerPageUrl(job: JobWithIntelligence): string | null {
    const baseUrl = job.company_website
    
    if (!baseUrl) {
      // Try to infer from company name
      if (!job.company) return null
      const companyName = job.company.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30)
      if (companyName.length < 3) return null
      return `https://${companyName}.com/careers`
    }
    
    // Append /careers to base URL
    try {
      const url = new URL(baseUrl)
      return `${url.origin}/careers`
    } catch {
      return `${baseUrl}/careers`
    }
  }
  
  /**
   * Get alternative career page URLs
   */
  private getAlternativeCareerUrls(job: JobWithIntelligence): string[] {
    const baseUrl = job.company_website
    if (!baseUrl) return []
    
    try {
      const url = new URL(baseUrl)
      const origin = url.origin
      
      return [
        `${origin}/jobs`,
        `${origin}/positions`,
        `${origin}/join-us`,
        `${origin}/work-with-us`,
        `${origin}/about/careers`,
        `${origin}/company/careers`,
      ]
    } catch {
      return []
    }
  }
  
  /**
   * Check if specific job is listed on career page
   */
  private checkJobListed(html: string, job: JobWithIntelligence): boolean {
    const lowerHtml = html.toLowerCase()
    const jobTitle = job.title.toLowerCase()
    
    // Check for exact title match
    if (lowerHtml.includes(jobTitle)) {
      return true
    }
    
    // Check for key words from job title
    const titleWords = jobTitle.split(/\s+/).filter(w => w.length > 3)
    const matchCount = titleWords.filter(word => lowerHtml.includes(word)).length
    
    return matchCount >= Math.min(3, titleWords.length * 0.7)
  }
  
  /**
   * Check if company name is mentioned
   */
  private checkCompanyMentioned(html: string, companyName: string): boolean {
    const lowerHtml = html.toLowerCase()
    const lowerCompany = companyName.toLowerCase()
    
    return lowerHtml.includes(lowerCompany)
  }
  
  /**
   * Count job listings on career page
   */
  private countJobListings(html: string): number {
    const lowerHtml = html.toLowerCase()
    
    // Common patterns for job listings
    const patterns = [
      /job-title/g,
      /position-title/g,
      /role-title/g,
      /job-card/g,
      /position-card/g,
      /opening/g,
      /vacancy/g,
    ]
    
    let maxCount = 0
    for (const pattern of patterns) {
      const matches = lowerHtml.match(pattern)
      if (matches && matches.length > maxCount) {
        maxCount = matches.length
      }
    }
    
    // Also check for common job-related keywords
    const jobKeywords = ['engineer', 'developer', 'designer', 'manager', 'analyst', 'specialist', 'coordinator']
    let keywordCount = 0
    for (const keyword of jobKeywords) {
      const regex = new RegExp(keyword, 'gi')
      const matches = lowerHtml.match(regex)
      if (matches) {
        keywordCount += matches.length
      }
    }
    
    return Math.max(maxCount, Math.floor(keywordCount / 3))
  }
  
  /**
   * Extract hiring regions from career page
   */
  private extractHiringRegions(html: string): string[] {
    const lowerHtml = html.toLowerCase()
    const regions: string[] = []
    
    const regionPatterns = [
      { pattern: /\b(us|usa|united states)\b/i, region: 'United States' },
      { pattern: /\b(uk|united kingdom)\b/i, region: 'United Kingdom' },
      { pattern: /\b(canada)\b/i, region: 'Canada' },
      { pattern: /\b(europe|eu)\b/i, region: 'Europe' },
      { pattern: /\b(asia)\b/i, region: 'Asia' },
      { pattern: /\b(africa)\b/i, region: 'Africa' },
      { pattern: /\b(latin america|latam)\b/i, region: 'Latin America' },
      { pattern: /\b(australia)\b/i, region: 'Australia' },
      { pattern: /\b(worldwide|global|anywhere)\b/i, region: 'Worldwide' },
      { pattern: /\b(remote)\b/i, region: 'Remote' },
    ]
    
    for (const { pattern, region } of regionPatterns) {
      if (pattern.test(html)) {
        regions.push(region)
      }
    }
    
    return regions
  }
  
  /**
   * Check for remote work mentions
   */
  private checkRemoteMentions(html: string): { found: boolean; keywords: string[] } {
    const keywords = [
      'remote',
      'work from home',
      'work from anywhere',
      'distributed team',
      'remote-first',
      'remote-friendly',
      'flexible location',
      'location independent',
    ]
    
    const found = this.searchPatterns(html, keywords)
    
    return {
      found: found.length > 0,
      keywords: found,
    }
  }
  
  /**
   * Check for diversity and inclusion mentions
   */
  private checkDiversityMentions(html: string): { found: boolean; keywords: string[] } {
    const keywords = [
      'diversity',
      'inclusion',
      'diverse',
      'inclusive',
      'equal opportunity',
      'eoe',
      'dei',
      'belonging',
      'equity',
    ]
    
    const found = this.searchPatterns(html, keywords)
    
    return {
      found: found.length > 0,
      keywords: found,
    }
  }
}
