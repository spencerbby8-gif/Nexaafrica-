/**
 * Intelligence Orchestrator
 * Coordinates evidence collection, scoring, and storage
 */

import type { Evidence, TrustScore, AfricaEligibility, IntelligenceScore } from './types'
import type { Job } from '@/lib/types'
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
          trust_score: 0,
          trust_level: 'very_low',
          trust_breakdown: {},
          trust_reasons: ['Analysis failed'],
        },
        eligibility: 'Unknown',
        intelligence_score: {
          intelligence_score: 0,
          intelligence_breakdown: {},
          intelligence_reasons: ['Analysis failed'],
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
    if (!this.supabase) {
      console.warn('Supabase client not initialized, skipping database save')
      return
    }
    
    const errors: string[] = []
    
    try {
      // Save evidence records
      for (const ev of evidence) {
        try {
          const { error } = await this.supabase
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
          
          if (error) {
            const errorMsg = `Failed to save evidence ${ev.evidence_type}: ${error.message}`
            console.error(errorMsg)
            errors.push(errorMsg)
          }
        } catch (error: any) {
          const errorMsg = `Exception saving evidence ${ev.evidence_type}: ${error.message}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      }
      
      // Save scores
      try {
        const { error: scoresError } = await this.supabase
          .from('job_scores')
          .upsert({
            job_id: jobId,
            trust_score: trustScore.trust_score,
            trust_level: trustScore.trust_level,
            trust_breakdown: trustScore.trust_breakdown,
            trust_reasons: trustScore.trust_reasons,
            africa_eligibility: eligibility,
            intelligence_score: intelligenceScore.intelligence_score,
            intelligence_breakdown: intelligenceScore.intelligence_breakdown,
            intelligence_reasons: intelligenceScore.intelligence_reasons,
            calculated_at: new Date().toISOString(),
          })
        
        if (scoresError) {
          const errorMsg = `Failed to save scores: ${scoresError.message}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      } catch (error: any) {
        const errorMsg = `Exception saving scores: ${error.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
      
      // Update job table with intelligence score
      try {
        const { error: jobError } = await this.supabase
          .from('jobs')
          .update({
            intelligence_score: intelligenceScore.intelligence_score,
            trust_score: trustScore.trust_score,
            africa_eligibility: eligibility,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
        
        if (jobError) {
          const errorMsg = `Failed to update job: ${jobError.message}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      } catch (error: any) {
        const errorMsg = `Exception updating job: ${error.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
      
      // If there were any errors, throw them so the caller knows
      if (errors.length > 0) {
        throw new Error(`Database save completed with ${errors.length} error(s): ${errors.join('; ')}`)
      }
    } catch (error: any) {
      console.error('Failed to save intelligence to database:', error)
      throw error // Re-throw so caller can handle it
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
