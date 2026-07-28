/**
 * Intelligence Score Engine
 * Calculates overall intelligence score combining trust and eligibility
 */

import type { Evidence, TrustScore, AfricaEligibility, IntelligenceScore } from '../types'

export class IntelligenceScoreEngine {
  // Weights for different components
  private readonly WEIGHTS = {
    trust: 0.40,
    eligibility: 0.30,
    evidence_quality: 0.20,
    completeness: 0.10,
  }
  
  /**
   * Calculate overall intelligence score
   */
  calculate(
    trustScore: TrustScore,
    eligibility: AfricaEligibility,
    evidence: Evidence[]
  ): IntelligenceScore {
    // Calculate evidence quality score
    const evidenceQuality = this.calculateEvidenceQuality(evidence)
    
    // Calculate completeness score
    const completeness = this.calculateCompleteness(evidence)
    
    // Calculate eligibility score (convert string to numeric score)
    const eligibilityScore = eligibility === 'Explicit' ? 100 : 
                           eligibility === 'Likely' ? 75 :
                           eligibility === 'Unknown' ? 50 : 25
    
    // Calculate weighted score
    const weightedScore = 
      (trustScore.trust_score * this.WEIGHTS.trust) +
      (eligibilityScore * this.WEIGHTS.eligibility) +
      (evidenceQuality * this.WEIGHTS.evidence_quality) +
      (completeness * this.WEIGHTS.completeness)
    
    const finalScore = Math.round(weightedScore)
    
    // Determine level
    const level = this.determineLevel(finalScore)
    
    // Build reasons
    const reasons: string[] = []
    
    if (trustScore.trust_score >= 70) {
      reasons.push(`High trust score (${trustScore.trust_score}%)`)
    } else if (trustScore.trust_score < 50) {
      reasons.push(`Low trust score (${trustScore.trust_score}%)`)
    }
    
    if (eligibility === 'Explicit') {
      reasons.push('Explicit Africa eligibility confirmed')
    } else if (eligibility === 'Restricted') {
      reasons.push('Location restrictions detected')
    }
    
    if (evidenceQuality >= 80) {
      reasons.push(`High evidence quality (${evidenceQuality}%)`)
    } else if (evidenceQuality < 50) {
      reasons.push(`Low evidence quality (${evidenceQuality}%)`)
    }
    
    if (completeness >= 80) {
      reasons.push(`Comprehensive evidence (${completeness}%)`)
    }
    
    return {
      intelligence_score: finalScore,
      intelligence_breakdown: {
        trust: trustScore.trust_score * this.WEIGHTS.trust,
        eligibility: eligibilityScore * this.WEIGHTS.eligibility,
        evidence_quality: evidenceQuality * this.WEIGHTS.evidence_quality,
        completeness: completeness * this.WEIGHTS.completeness,
      },
      intelligence_reasons: reasons,
    }
  }
  
  /**
   * Calculate evidence quality score
   */
  private calculateEvidenceQuality(evidence: Evidence[]): number {
    if (evidence.length === 0) return 0
    
    // Average confidence score
    const avgConfidence = evidence.reduce((sum, ev) => sum + ev.confidence_score, 0) / evidence.length
    
    // Check for verified evidence
    const verifiedCount = evidence.filter(ev => ev.verification_status === 'verified').length
    const verifiedRatio = verifiedCount / evidence.length
    
    // Check for diverse evidence types
    const uniqueTypes = new Set(evidence.map(ev => ev.evidence_type)).size
    const diversityScore = Math.min(100, (uniqueTypes / 8) * 100)
    
    // Combine scores
    return Math.round(
      (avgConfidence * 0.4) +
      (verifiedRatio * 100 * 0.3) +
      (diversityScore * 0.3)
    )
  }
  
  /**
   * Calculate completeness score
   */
  private calculateCompleteness(evidence: Evidence[]): number {
    // Check for key evidence types
    const requiredTypes = [
      'company_website',
      'ats_data',
      'career_page',
      'domain_quality',
      'broken_links',
    ]
    
    const optionalTypes = [
      'duplicate_detection',
      'salary_realism',
      'company_reputation',
    ]
    
    let score = 0
    const evidenceTypes = new Set(evidence.map(ev => ev.evidence_type))
    
    // Required types (70% of score)
    const requiredFound = requiredTypes.filter(type => evidenceTypes.has(type as any)).length
    score += (requiredFound / requiredTypes.length) * 70
    
    // Optional types (30% of score)
    const optionalFound = optionalTypes.filter(type => evidenceTypes.has(type as any)).length
    score += (optionalFound / optionalTypes.length) * 30
    
    return Math.round(score)
  }
  
  /**
   * Determine intelligence level from score
   */
  private determineLevel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 80) return 'excellent'
    if (score >= 60) return 'good'
    if (score >= 40) return 'fair'
    return 'poor'
  }
}
