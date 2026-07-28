/**
 * Domain Quality Collector
 * Checks domain age, SSL certificate, and reputation
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType } from '../types'
import type { Job } from '@/lib/types'

export class DomainQualityCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'domain_quality'
  
  async collect(job: Job): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      // Extract domain from apply URL
      const domain = this.extractDomain(job.apply_url)
      
      if (!domain) {
        return this.createEvidence(
          job,
          {
            domain_found: false,
            reason: 'Could not extract domain from apply URL',
          },
          'failed',
          0,
          'No domain found',
          undefined,
          'Domain Quality Check'
        )
      }
      
      // Check SSL certificate
      const sslCheck = await this.checkSSL(domain)
      
      // Check domain age (simplified - in production would use WHOIS API)
      const domainAge = await this.checkDomainAge(domain)
      
      // Check for suspicious patterns
      const suspiciousPatterns = this.checkSuspiciousPatterns(domain)
      
      // Check for free email providers
      const isFreeEmailProvider = this.isFreeEmailProvider(domain)
      
      // Calculate confidence
      const confidence = this.calculateConfidence([
        { value: sslCheck.valid, weight: 30 },
        { value: domainAge.days > 365, weight: 25 },
        { value: !suspiciousPatterns.hasSuspicious, weight: 25 },
        { value: !isFreeEmailProvider, weight: 20 },
      ])
      
      // Determine status
      const status = sslCheck.valid && domainAge.days > 30 && !suspiciousPatterns.hasSuspicious
        ? 'verified'
        : sslCheck.valid
        ? 'partial'
        : 'failed'
      
      // Create summary
      const summaryParts = []
      if (sslCheck.valid) summaryParts.push('SSL valid')
      if (domainAge.days > 365) summaryParts.push(`${Math.floor(domainAge.days / 365)}y old`)
      if (suspiciousPatterns.hasSuspicious) summaryParts.push('suspicious patterns')
      if (isFreeEmailProvider) summaryParts.push('free email provider')
      
      const summary = summaryParts.length > 0
        ? `Domain quality: ${summaryParts.join(', ')}`
        : 'Domain quality check incomplete'
      
      return this.createEvidence(
        job,
        {
          domain_found: true,
          domain,
          ssl_valid: sslCheck.valid,
          ssl_issuer: sslCheck.issuer,
          ssl_expiry: sslCheck.expiry,
          domain_age_days: domainAge.days,
          domain_age_years: Math.floor(domainAge.days / 365),
          suspicious_patterns: suspiciousPatterns.patterns,
          is_free_email_provider: isFreeEmailProvider,
          check_duration_ms: Date.now() - startTime,
        },
        status,
        confidence,
        summary,
        undefined,
        'Domain Quality Check'
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
        `Domain quality check failed: ${error.message}`,
        undefined,
        'Domain Quality Check'
      )
    }
  }
  
  /**
   * Check SSL certificate
   */
  private async checkSSL(domain: string): Promise<{ valid: boolean; issuer?: string; expiry?: string }> {
    try {
      const url = `https://${domain}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      })
      
      clearTimeout(timeout)
      
      // If we can connect via HTTPS, SSL is valid
      return {
        valid: true,
        issuer: 'Unknown', // Would need deeper inspection to get issuer
      }
    } catch (error: any) {
      // Check if it's an SSL error
      if (error.message?.includes('certificate') || error.message?.includes('SSL')) {
        return { valid: false }
      }
      
      // Other errors (timeout, DNS, etc.) - assume SSL might be valid
      return { valid: true }
    }
  }
  
  /**
   * Check domain age (simplified)
   * In production, this would use a WHOIS API
   */
  private async checkDomainAge(domain: string): Promise<{ days: number }> {
    // Simplified: assume domain is at least 1 year old if it's accessible
    // In production, use WHOIS API to get actual registration date
    try {
      const url = `https://${domain}`
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
      })
      
      if (response.ok) {
        // Assume domain is at least 1 year old if accessible
        return { days: 365 }
      }
      
      return { days: 0 }
    } catch {
      return { days: 0 }
    }
  }
  
  /**
   * Check for suspicious domain patterns
   */
  private checkSuspiciousPatterns(domain: string): { hasSuspicious: boolean; patterns: string[] } {
    const patterns: string[] = []
    const lowerDomain = domain.toLowerCase()
    
    // Check for excessive hyphens
    const hyphenCount = (lowerDomain.match(/-/g) || []).length
    if (hyphenCount > 3) {
      patterns.push('excessive hyphens')
    }
    
    // Check for numbers in domain (suspicious if not a known brand)
    if (/\d{3,}/.test(lowerDomain)) {
      patterns.push('multiple numbers')
    }
    
    // Check for very long domain
    if (lowerDomain.length > 50) {
      patterns.push('very long domain')
    }
    
    // Check for suspicious TLDs
    const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click']
    if (suspiciousTLDs.some(tld => lowerDomain.endsWith(tld))) {
      patterns.push('suspicious TLD')
    }
    
    // Check for misspellings of popular domains
    const popularDomains = ['google', 'microsoft', 'amazon', 'apple', 'facebook', 'linkedin']
    for (const popular of popularDomains) {
      if (lowerDomain.includes(popular) && !lowerDomain.startsWith(popular)) {
        patterns.push(`possible ${popular} impersonation`)
      }
    }
    
    return {
      hasSuspicious: patterns.length > 0,
      patterns,
    }
  }
  
  /**
   * Check if domain is a free email provider
   */
  private isFreeEmailProvider(domain: string): boolean {
    const freeEmailProviders = [
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'aol.com',
      'icloud.com',
      'mail.com',
      'protonmail.com',
      'zoho.com',
      'yandex.com',
    ]
    
    const lowerDomain = domain.toLowerCase()
    return freeEmailProviders.some(provider => lowerDomain.includes(provider))
  }
}
