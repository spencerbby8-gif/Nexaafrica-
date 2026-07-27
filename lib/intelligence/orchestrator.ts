/**
 * Intelligence Orchestrator
 * Coordinates evidence collection, scoring, and storage
 */

import type { Evidence, TrustScore, AfricaEligibility, IntelligenceScore, Job } from '../types'
import { getCollector } from './collectors'
import { TrustScoreEngine } from './scoring/trust-score'
import { AfricaEligibilityEngine } from './scoring/africa-eligibility'
import { IntelligenceScoreEngine } from './scoring/intelligence-score'
import { createClient } from '@supabase/supabase-js'

export interface OrchestratorResult {
  job_id: string
  evidence: Evidence[]
  trust_score: TrustScore
  eligibility: AfricaEligibility
  intelligence_score: IntelligenceScore
  success: boolean
  errors: string[]
}

export class IntelligenceOrchestrator {
  private trustEngine: TrustScoreEngine
  private eligibilityEngine: AfricaEligibilityEngine
  private intelligenceEngine: IntelligenceScoreEngine
  private supabase: any
  
  constructor() {
    this.trustEngine = new TrustScoreEngine()
    this.eligibilityEngine = new AfricaEligibilityEngine()
    this.intelligenceEngine = new IntelligenceScoreEngine()
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey)
    }
  }
  
  /**
   * Run full intelligence analysis for a job
   */
  async analyze(job: Job): Promise<OrchestratorResult> {
    const errors: string[] = []
    const evidence: Evidence[] = []
    
    try {
      // Collect evidence from all collectors
      const collectors = [
        'company_website',
        'ats_data',
        'career_page',
        'domain_quality',
        'broken_links',
        'duplicate_detection',
        'salary_realism',
        'company_reputation',
      ]
      
      // Run collectors in parallel
      const collectorPromises = collectors.map(async (type) => {
        try {
          const collector = getCollector(type as any)
          if (!collector) return null
          
          const evidence = await collector.collect(job)
          return evidence
        } catch (error: any) {
          errors.push(`${type} collector failed: ${error.message}`)
          return null
        }
      })
      
      const results = await Promise.all(collectorPromises)
      
      // Filter out null results
      for (const result of results) {
        if (result) {
          evidence.push(result)
        }
      }
      
      // Calculate scores
      const trustScore = this.trustEngine.calculate(evidence)
      const eligibility = this.eligibilityEngine.calculate(evidence, job.description_md)
      const intelligenceScore = this.intelligenceEngine.calculate(trustScore, eligibility, evidence)
      
      // Save to database if Supabase is available
      if (this.supabase) {
        await this.saveToDatabase(job.id, evidence, trustScore, eligibility, intelligenceScore)
      }
      
      return {
        job_id: job.id,
        evidence,
        trust_score: trustScore,
        eligibility,
        intelligence_score: intelligenceScore,
        success: errors.length === 0,
        errors,
      }
    } catch (error: any) {
      errors.push(`Orchestrator failed: ${error.message}`)
      
      return {
        job_id: job.id,
        evidence: [],
        trust_score: {
          score: 0,
          level: 'very_low',
          breakdown: {},
          reasons: ['Analysis failed'],
          calculated_at: new Date().toISOString(),
        },
        eligibility: {
          level: 'Unknown',
          confidence: 0,
          evidence: [],
          reasons: ['Analysis failed'],
          calculated_at: new Date().toISOString(),
        },
        intelligence_score: {
          score: 0,
          level: 'poor',
          trust_score: 0,
          eligibility_level: 'Unknown',
          eligibility_confidence: 0,
          evidence_quality: 0,
          completeness: 0,
          reasons: ['Analysis failed'],
          calculated_at: new Date().toISOString(),
        },
        success: false,
        errors,
      }
    }
  }
  
  /**
   * Save intelligence results to database
   */
  private async saveToDatabase(
    jobId: string,
    evidence: Evidence[],
    trustScore: TrustScore,
    eligibility: AfricaEligibility,
    intelligenceScore: IntelligenceScore
  ): Promise<void> {
    if (!this.supabase) return
    
    try {
      // Save evidence records
      for (const ev of evidence) {
        await this.supabase
          .from('job_evidence')
          .upsert({
            job_id: jobId,
            evidence_type: ev.evidence_type,
            verification_status: ev.verification_status,
            confidence_score: ev.confidence_score,
            evidence_data: ev.evidence_data,
            evidence_summary: ev.evidence_summary,
            source_url: ev.source_url,
            source_name: ev.source_name,
            collected_at: ev.collected_at,
          })
      }
      
      // Save scores
      await this.supabase
        .from('job_scores')
        .upsert({
          job_id: jobId,
          trust_score: trustScore.score,
          trust_level: trustScore.level,
          trust_breakdown: trustScore.breakdown,
          trust_reasons: trustScore.reasons,
          africa_eligibility: eligibility.level,
          africa_confidence: eligibility.confidence,
          africa_evidence: eligibility.evidence,
          africa_reasons: eligibility.reasons,
          intelligence_score: intelligenceScore.score,
          intelligence_level: intelligenceScore.level,
          evidence_quality: intelligenceScore.evidence_quality,
          completeness: intelligenceScore.completeness,
          intelligence_reasons: intelligenceScore.reasons,
          calculated_at: new Date().toISOString(),
        })
      
      // Update job table with intelligence score
      await this.supabase
        .from('jobs')
        .update({
          intelligence_score: intelligenceScore.score,
          trust_score: trustScore.score,
          africa_eligibility: eligibility.level,
          africa_confidence: eligibility.confidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
    } catch (error: any) {
      console.error('Failed to save intelligence to database:', error)
    }
  }
  
  /**
   * Analyze multiple jobs in batch
   */
  async analyzeBatch(jobs: Job[], concurrency: number = 5): Promise<OrchestratorResult[]> {
    const results: OrchestratorResult[] = []
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < jobs.length; i += concurrency) {
      const batch = jobs.slice(i, i + concurrency)
      const batchPromises = batch.map(job => this.analyze(job))
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
      
      // Small delay between batches
      if (i + concurrency < jobs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    return results
  }
}
