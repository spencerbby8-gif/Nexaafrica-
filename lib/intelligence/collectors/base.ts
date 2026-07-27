/**
 * Base Evidence Collector
 * Provides common functionality for all evidence collectors
 */

import type { Evidence, EvidenceCollector, EvidenceType, JobWithIntelligence, VerificationStatus } from '../types'

export abstract class BaseEvidenceCollector implements EvidenceCollector {
  abstract type: EvidenceType
  
  abstract collect(job: JobWithIntelligence): Promise<Evidence>
  
  /**
   * Create a basic evidence object with common fields
   */
  protected createEvidence(
    job: JobWithIntelligence,
    data: Record<string, any>,
    status: VerificationStatus,
    confidence: number,
    summary?: string,
    sourceUrl?: string,
    sourceName?: string
  ): Evidence {
    return {
      job_id: job.id,
      evidence_type: this.type,
      source_url: sourceUrl,
      source_name: sourceName,
      evidence_data: data,
      evidence_summary: summary,
      verification_status: status,
      confidence_score: Math.max(0, Math.min(100, Math.round(confidence))),
      collected_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
    }
  }
  
  /**
   * Calculate confidence based on multiple factors
   */
  protected calculateConfidence(factors: Array<{ value: boolean | number; weight: number }>): number {
    let totalWeight = 0
    let weightedSum = 0
    
    for (const factor of factors) {
      const score = typeof factor.value === 'boolean' 
        ? (factor.value ? 100 : 0)
        : Math.max(0, Math.min(100, factor.value))
      
      weightedSum += score * factor.weight
      totalWeight += factor.weight
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 50
  }
  
  /**
   * Extract domain from URL
   */
  protected extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return null
    }
  }
  
  /**
   * Check if a URL is accessible
   */
  protected async checkUrlAccessible(url: string, timeoutMs = 5000): Promise<{ accessible: boolean; status?: number; error?: string }> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      })
      
      clearTimeout(timeout)
      
      return {
        accessible: response.ok,
        status: response.status,
      }
    } catch (error: any) {
      return {
        accessible: false,
        error: error.message || 'Unknown error',
      }
    }
  }
  
  /**
   * Fetch and parse JSON from URL
   */
  protected async fetchJson(url: string, timeoutMs = 5000): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      })
      
      clearTimeout(timeout)
      
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }
      
      const data = await response.json()
      return { success: true, data }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      }
    }
  }
  
  /**
   * Fetch HTML content from URL
   */
  protected async fetchHtml(url: string, timeoutMs = 5000): Promise<{ success: boolean; html?: string; error?: string }> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'NexaAfrica/1.0 (Job Intelligence System)',
        },
      })
      
      clearTimeout(timeout)
      
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }
      
      const html = await response.text()
      return { success: true, html }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      }
    }
  }
  
  /**
   * Search for text patterns in content
   */
  protected searchPatterns(content: string, patterns: string[]): string[] {
    const found: string[] = []
    const lowerContent = content.toLowerCase()
    
    for (const pattern of patterns) {
      if (lowerContent.includes(pattern.toLowerCase())) {
        found.push(pattern)
      }
    }
    
    return found
  }
  
  /**
   * Extract text between two markers
   */
  protected extractBetween(content: string, startMarker: string, endMarker: string): string | null {
    const startIndex = content.indexOf(startMarker)
    if (startIndex === -1) return null
    
    const endIndex = content.indexOf(endMarker, startIndex + startMarker.length)
    if (endIndex === -1) return null
    
    return content.substring(startIndex + startMarker.length, endIndex).trim()
  }
}
