/**
 * Duplicate Detection Collector
 * Checks if job is a duplicate of existing jobs
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType } from '../types'
import type { Job } from '@/lib/types'
import { createClient } from '@supabase/supabase-js'

export class DuplicateDetectionCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'duplicate_detection'
  
  async collect(job: Job): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      // Initialize Supabase client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey) {
        return this.createEvidence(
          job,
          {
            duplicates_checked: false,
            reason: 'Supabase credentials not available',
          },
          'pending',
          50,
          'Could not check for duplicates',
          undefined,
          'Duplicate Detection'
        )
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey)
      
      // Search for potential duplicates
      const duplicates = await this.findDuplicates(supabase, job)
      
      // Calculate confidence
      const confidence = duplicates.length === 0 ? 100 : Math.max(0, 100 - (duplicates.length * 20))
      
      // Determine status
      const status = duplicates.length === 0
        ? 'verified'
        : duplicates.some(d => d.similarity > 0.9)
        ? 'failed'
        : 'partial'
      
      // Create summary
      const summary = duplicates.length === 0
        ? 'No duplicates found'
        : `Found ${duplicates.length} potential duplicate(s): ${duplicates.map(d => `${d.job_id} (${Math.round(d.similarity * 100)}% similar)`).join(', ')}`
      
      return this.createEvidence(
        job,
        {
          duplicates_checked: true,
          duplicates_found: duplicates.length,
          duplicates,
          check_duration_ms: Date.now() - startTime,
        },
        status,
        confidence,
        summary,
        undefined,
        'Duplicate Detection'
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
        `Duplicate detection failed: ${error.message}`,
        undefined,
        'Duplicate Detection'
      )
    }
  }
  
  /**
   * Find potential duplicates in database
   */
  private async findDuplicates(supabase: any, job: Job): Promise<Array<{
    job_id: string
    title: string
    company: string
    similarity: number
    match_reason: string
  }>> {
    const duplicates: Array<{
      job_id: string
      title: string
      company: string
      similarity: number
      match_reason: string
    }> = []
    
    try {
      // Search for jobs with similar title and company
      const { data: similarJobs, error } = await supabase
        .from('jobs')
        .select('id, title, company, apply_url, posted_at')
        .eq('is_active', true)
        .neq('id', job.id)
        .limit(50)
      
      if (error || !similarJobs) {
        return duplicates
      }
      
      // Check each job for similarity
      for (const existingJob of similarJobs) {
        const similarity = this.calculateSimilarity(job, existingJob)
        
        if (similarity.score > 0.7) {
          duplicates.push({
            job_id: existingJob.id,
            title: existingJob.title,
            company: existingJob.company,
            similarity: similarity.score,
            match_reason: similarity.reason,
          })
        }
      }
      
      // Sort by similarity descending
      duplicates.sort((a, b) => b.similarity - a.similarity)
      
      return duplicates.slice(0, 5) // Return top 5 duplicates
    } catch (error) {
      return duplicates
    }
  }
  
  /**
   * Calculate similarity between two jobs
   */
  private calculateSimilarity(job1: Job, job2: any): { score: number; reason: string } {
    let score = 0
    const reasons: string[] = []
    
    // Title similarity (40% weight)
    const titleSimilarity = this.stringSimilarity(job1.title, job2.title)
    score += titleSimilarity * 0.4
    if (titleSimilarity > 0.8) {
      reasons.push('similar title')
    }
    
    // Company similarity (30% weight)
    const companySimilarity = this.stringSimilarity(job1.company, job2.company)
    score += companySimilarity * 0.3
    if (companySimilarity > 0.8) {
      reasons.push('same company')
    }
    
    // Apply URL similarity (20% weight)
    if (job1.apply_url && job2.apply_url) {
      const urlSimilarity = this.stringSimilarity(job1.apply_url, job2.apply_url)
      score += urlSimilarity * 0.2
      if (urlSimilarity > 0.9) {
        reasons.push('same apply URL')
      }
    }
    
    // Source ID similarity (10% weight)
    if (job1.source_id && job2.source_id && job1.source === job2.source) {
      const sourceSimilarity = this.stringSimilarity(job1.source_id, job2.source_id)
      score += sourceSimilarity * 0.1
      if (sourceSimilarity > 0.9) {
        reasons.push('same source ID')
      }
    }
    
    return {
      score,
      reason: reasons.length > 0 ? reasons.join(', ') : 'low similarity',
    }
  }
  
  /**
   * Calculate string similarity using Levenshtein distance
   */
  private stringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0
    
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()
    
    if (s1 === s2) return 1
    
    // Calculate Levenshtein distance
    const matrix = this.levenshteinDistance(s1, s2)
    const maxLen = Math.max(s1.length, s2.length)
    
    if (maxLen === 0) return 1
    
    return 1 - (matrix / maxLen)
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length
    const n = str2.length
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
    
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        }
      }
    }
    
    return dp[m][n]
  }
}
