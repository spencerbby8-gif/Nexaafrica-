/**
 * Trust Score Engine
 * Calculates overall trust score based on evidence verification
 */

import type { Evidence, TrustScore, TrustLevel } from '../types'

export class TrustScoreEngine {
  // Weights for different evidence types
  private readonly WEIGHTS: Record<string, number> = {
    company_website: 0.15,
    ats_data: 0.20,
    career_page: 0.15,
    domain_quality: 0.10,
    broken_links: 0.10,
    duplicate_detection: 0.15,
    salary_realism: 0.10,
    company_reputation: 0.05,
  }
  
  /**
   * Calculate trust score from evidence
   */
  calculate(evidence: Evidence[]): TrustScore {
    if (evidence.length === 0) {
      return {
        trust_score: 0,
        trust_level: 'very_low',
        trust_breakdown: {},
        trust_reasons: ['No evidence available'],
      }
    }
    
    // Calculate weighted score
    let totalWeight = 0
    let weightedScore = 0
    const breakdown: Record<string, number> = {}
    const reasons: string[] = []
    
    for (const ev of evidence) {
      const weight = this.WEIGHTS[ev.evidence_type] || 0.05
      const score = ev.confidence_score
      
      breakdown[ev.evidence_type] = score
      weightedScore += score * weight
      totalWeight += weight
      
      // Add reasons for high/low scores
      if (score >= 80) {
        reasons.push(`${this.formatEvidenceType(ev.evidence_type)} verified (${score}%)`)
      } else if (score < 50) {
        reasons.push(`${this.formatEvidenceType(ev.evidence_type)} issues detected (${score}%)`)
      }
    }
    
    // Normalize score
    const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
    
    // Determine trust level
    const level = this.determineTrustLevel(finalScore)
    
    return {
      trust_score: finalScore,
      trust_level: level,
      trust_breakdown: breakdown,
      trust_reasons: reasons.slice(0, 5), // Top 5 reasons
    }
  }
  
  /**
   * Determine trust level from score
   */
  private determineTrustLevel(score: number): TrustLevel {
    if (score >= 80) return 'high'
    if (score >= 60) return 'medium'
    if (score >= 40) return 'low'
    return 'very_low'
  }
  
  /**
   * Format evidence type for display
   */
  private formatEvidenceType(type: string): string {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
}
