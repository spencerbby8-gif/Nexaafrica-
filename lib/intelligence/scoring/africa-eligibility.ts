/**
 * Africa Eligibility Engine
 * Determines if job is open to African candidates
 */

import type { Evidence, AfricaEligibility, AfricaEligibilityLevel } from '../types'

export class AfricaEligibilityEngine {
  // Keywords that indicate explicit Africa eligibility
  private readonly EXPLICIT_KEYWORDS = [
    'africa',
    'african',
    'nigeria',
    'kenya',
    'south africa',
    'ghana',
    'egypt',
    'morocco',
    'ethiopia',
    'tanzania',
    'uganda',
    'rwanda',
    'senegal',
    'ivory coast',
    'cameroon',
    'angola',
    'mozambique',
    'zimbabwe',
    'botswana',
    'namibia',
    'zambia',
    'malawi',
    'madagascar',
    'mauritius',
    'seychelles',
  ]
  
  // Keywords that indicate likely Africa eligibility
  private readonly LIKELY_KEYWORDS = [
    'emea',
    'middle east and africa',
    'mea',
    'global',
    'worldwide',
    'any location',
    'any country',
    'remote worldwide',
    'international',
    'all countries',
  ]
  
  // Keywords that indicate restricted eligibility
  private readonly RESTRICTED_KEYWORDS = [
    'us only',
    'usa only',
    'united states only',
    'us citizens only',
    'us work authorization required',
    'must be located in',
    'must reside in',
    'uk only',
    'europe only',
    'eu only',
    'canada only',
    'australia only',
    'not open to',
    'excluding',
  ]
  
  /**
   * Calculate Africa eligibility from evidence
   */
  calculate(evidence: Evidence[], jobDescription?: string): AfricaEligibility {
    const allText = this.combineEvidenceText(evidence, jobDescription)
    
    // Check for explicit mentions
    const explicitMatches = this.findKeywordMatches(allText, this.EXPLICIT_KEYWORDS)
    if (explicitMatches.length > 0) {
      return {
        level: 'Explicit',
        confidence: Math.min(100, 70 + explicitMatches.length * 10),
        evidence: explicitMatches.slice(0, 3),
        reasons: [`Explicit mention of ${explicitMatches.slice(0, 3).join(', ')}`],
        calculated_at: new Date().toISOString(),
      }
    }
    
    // Check for likely indicators
    const likelyMatches = this.findKeywordMatches(allText, this.LIKELY_KEYWORDS)
    if (likelyMatches.length > 0) {
      return {
        level: 'Likely',
        confidence: Math.min(90, 60 + likelyMatches.length * 10),
        evidence: likelyMatches.slice(0, 3),
        reasons: [`Global/EMEA role: ${likelyMatches.slice(0, 3).join(', ')}`],
        calculated_at: new Date().toISOString(),
      }
    }
    
    // Check for restrictions
    const restrictedMatches = this.findKeywordMatches(allText, this.RESTRICTED_KEYWORDS)
    if (restrictedMatches.length > 0) {
      return {
        level: 'Restricted',
        confidence: Math.min(100, 70 + restrictedMatches.length * 10),
        evidence: restrictedMatches.slice(0, 3),
        reasons: [`Location restrictions: ${restrictedMatches.slice(0, 3).join(', ')}`],
        calculated_at: new Date().toISOString(),
      }
    }
    
    // Check for remote work indicators
    const remoteIndicators = this.checkRemoteIndicators(allText)
    if (remoteIndicators.isRemote) {
      return {
        level: 'Likely',
        confidence: 50 + remoteIndicators.confidence,
        evidence: remoteIndicators.evidence.slice(0, 3),
        reasons: ['Remote work indicated, likely open to Africa'],
        calculated_at: new Date().toISOString(),
      }
    }
    
    // Default to Unknown
    return {
      level: 'Unknown',
      confidence: 30,
      evidence: [],
      reasons: ['No clear indication of Africa eligibility'],
      calculated_at: new Date().toISOString(),
    }
  }
  
  /**
   * Combine text from all evidence
   */
  private combineEvidenceText(evidence: Evidence[], jobDescription?: string): string {
    const texts: string[] = []
    
    if (jobDescription) {
      texts.push(jobDescription.toLowerCase())
    }
    
    for (const ev of evidence) {
      if (ev.evidence_summary) {
        texts.push(ev.evidence_summary.toLowerCase())
      }
      
      // Extract text from evidence data
      if (ev.evidence_data) {
        const dataStr = JSON.stringify(ev.evidence_data).toLowerCase()
        texts.push(dataStr)
      }
    }
    
    return texts.join(' ')
  }
  
  /**
   * Find keyword matches in text
   */
  private findKeywordMatches(text: string, keywords: string[]): string[] {
    const matches: string[] = []
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
      if (regex.test(text)) {
        matches.push(keyword)
      }
    }
    
    return matches
  }
  
  /**
   * Check for remote work indicators
   */
  private checkRemoteIndicators(text: string): {
    isRemote: boolean
    confidence: number
    evidence: string[]
  } {
    const remoteKeywords = [
      'remote',
      'work from home',
      'work from anywhere',
      'distributed team',
      'remote-first',
      'remote-friendly',
      'location independent',
      'flexible location',
    ]
    
    const matches = this.findKeywordMatches(text, remoteKeywords)
    
    return {
      isRemote: matches.length > 0,
      confidence: Math.min(40, matches.length * 10),
      evidence: matches.slice(0, 3),
    }
  }
}
