/**
 * ATS Data Collector
 * Verifies that the job exists in the ATS system and data is consistent
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType, JobWithIntelligence } from '../types'

export class ATSDataCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'ats_data'
  
  async collect(job: JobWithIntelligence): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      // Check if job has ATS source information
      if (!job.source || !job.source_id) {
        return this.createEvidence(
          job,
          {
            ats_source: null,
            ats_job_id: null,
            has_ats_data: false,
            reason: 'No ATS source or source ID provided',
          },
          'pending',
          30,
          'No ATS data available for verification',
          undefined,
          'ATS Data Verification'
        )
      }
      
      // Verify ATS data based on source type
      const verification = await this.verifyATSData(job)
      
      // Calculate confidence
      const confidence = this.calculateConfidence([
        { value: verification.source_exists, weight: 40 },
        { value: verification.job_exists, weight: 40 },
        { value: verification.data_consistent, weight: 20 },
      ])
      
      // Determine status
      const status = verification.source_exists && verification.job_exists
        ? verification.data_consistent ? 'verified' : 'partial'
        : 'failed'
      
      // Create summary
      const summary = verification.job_exists
        ? verification.data_consistent
          ? `Job verified in ${job.source} ATS with consistent data`
          : `Job found in ${job.source} ATS but data inconsistencies detected`
        : `Job not found in ${job.source} ATS`
      
      return this.createEvidence(
        job,
        {
          ats_source: job.source,
          ats_job_id: job.source_id,
          has_ats_data: true,
          source_exists: verification.source_exists,
          job_exists: verification.job_exists,
          data_consistent: verification.data_consistent,
          discrepancies: verification.discrepancies,
          verification_details: verification.details,
          check_duration_ms: Date.now() - startTime,
        },
        status,
        confidence,
        summary,
        undefined,
        'ATS Data Verification'
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
        `ATS data verification failed: ${error.message}`,
        undefined,
        'ATS Data Verification'
      )
    }
  }
  
  /**
   * Verify ATS data based on source type
   */
  private async verifyATSData(job: JobWithIntelligence): Promise<{
    source_exists: boolean
    job_exists: boolean
    data_consistent: boolean
    discrepancies: string[]
    details: Record<string, any>
  }> {
    const discrepancies: string[] = []
    const details: Record<string, any> = {}
    
    // Different verification logic based on ATS source
    switch (job.source) {
      case 'greenhouse':
        return this.verifyGreenhouse(job, discrepancies, details)
      case 'lever':
        return this.verifyLever(job, discrepancies, details)
      case 'ashby':
        return this.verifyAshby(job, discrepancies, details)
      case 'workable':
        return this.verifyWorkable(job, discrepancies, details)
      case 'smartrecruiters':
        return this.verifySmartRecruiters(job, discrepancies, details)
      case 'recruitee':
        return this.verifyRecruitee(job, discrepancies, details)
      case 'personio':
        return this.verifyPersonio(job, discrepancies, details)
      case 'comeet':
        return this.verifyComeet(job, discrepancies, details)
      case 'remoteok':
        return this.verifyRemoteOK(job, discrepancies, details)
      case 'weworkremotely':
        return this.verifyWeWorkRemotely(job, discrepancies, details)
      case 'himalayas':
        return this.verifyHimalayas(job, discrepancies, details)
      default:
        // Unknown source - can't verify
        return {
          source_exists: false,
          job_exists: false,
          data_consistent: false,
          discrepancies: ['Unknown ATS source'],
          details: { source: job.source },
        }
    }
  }
  
  /**
   * Verify Greenhouse job
   */
  private async verifyGreenhouse(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    // Greenhouse board URL pattern: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${job.source_id}/jobs`
    
    const result = await this.fetchJson(apiUrl, 8000)
    
    if (!result.success) {
      return {
        source_exists: false,
        job_exists: false,
        data_consistent: false,
        discrepancies: [`Could not fetch Greenhouse data: ${result.error}`],
        details: { api_url: apiUrl, error: result.error },
      }
    }
    
    const jobs = result.data?.jobs || []
    const atsJob = jobs.find((j: any) => j.id === parseInt(job.source_id.split('_').pop() || '0'))
    
    if (!atsJob) {
      return {
        source_exists: true,
        job_exists: false,
        data_consistent: false,
        discrepancies: ['Job not found in Greenhouse board'],
        details: { api_url: apiUrl, jobs_count: jobs.length },
      }
    }
    
    // Check data consistency
    if (atsJob.title && job.title && !this.fuzzyMatch(atsJob.title, job.title)) {
      discrepancies.push(`Title mismatch: ATS="${atsJob.title}" vs Job="${job.title}"`)
    }
    
    details.ats_job = {
      id: atsJob.id,
      title: atsJob.title,
      location: atsJob.location?.name,
      absolute_url: atsJob.absolute_url,
    }
    
    return {
      source_exists: true,
      job_exists: true,
      data_consistent: discrepancies.length === 0,
      discrepancies,
      details,
    }
  }
  
  /**
   * Verify Lever job
   */
  private async verifyLever(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    // Lever API pattern: https://api.lever.co/v0/postings/{company}?mode=json
    const company = job.source_id.split('_')[0]
    const jobId = job.source_id.split('_')[1]
    const apiUrl = `https://api.lever.co/v0/postings/${company}?mode=json`
    
    const result = await this.fetchJson(apiUrl, 8000)
    
    if (!result.success) {
      return {
        source_exists: false,
        job_exists: false,
        data_consistent: false,
        discrepancies: [`Could not fetch Lever data: ${result.error}`],
        details: { api_url: apiUrl, error: result.error },
      }
    }
    
    const jobs = result.data || []
    const atsJob = jobs.find((j: any) => j.id === jobId)
    
    if (!atsJob) {
      return {
        source_exists: true,
        job_exists: false,
        data_consistent: false,
        discrepancies: ['Job not found in Lever postings'],
        details: { api_url: apiUrl, jobs_count: jobs.length },
      }
    }
    
    // Check data consistency
    if (atsJob.text && job.title && !this.fuzzyMatch(atsJob.text, job.title)) {
      discrepancies.push(`Title mismatch: ATS="${atsJob.text}" vs Job="${job.title}"`)
    }
    
    details.ats_job = {
      id: atsJob.id,
      title: atsJob.text,
      location: atsJob.categories?.location,
      apply_url: atsJob.applyUrl,
    }
    
    return {
      source_exists: true,
      job_exists: true,
      data_consistent: discrepancies.length === 0,
      discrepancies,
      details,
    }
  }
  
  /**
   * Verify Ashby job
   */
  private async verifyAshby(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    // Ashby doesn't have a public API, so we verify the apply URL is accessible
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    if (!applyUrlCheck.accessible) {
      return {
        source_exists: true,
        job_exists: false,
        data_consistent: false,
        discrepancies: [`Apply URL not accessible: ${applyUrlCheck.error || `HTTP ${applyUrlCheck.status}`}`],
        details: { apply_url: job.apply_url, status: applyUrlCheck.status },
      }
    }
    
    return {
      source_exists: true,
      job_exists: true,
      data_consistent: true,
      discrepancies: [],
      details: { apply_url: job.apply_url, accessible: true },
    }
  }
  
  /**
   * Verify Workable job
   */
  private async verifyWorkable(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    // Workable doesn't have a public API, verify apply URL
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    return {
      source_exists: true,
      job_exists: applyUrlCheck.accessible,
      data_consistent: applyUrlCheck.accessible,
      discrepancies: applyUrlCheck.accessible ? [] : [`Apply URL not accessible: ${applyUrlCheck.error}`],
      details: { apply_url: job.apply_url, accessible: applyUrlCheck.accessible },
    }
  }
  
  /**
   * Verify SmartRecruiters job
   */
  private async verifySmartRecruiters(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    return {
      source_exists: true,
      job_exists: applyUrlCheck.accessible,
      data_consistent: applyUrlCheck.accessible,
      discrepancies: applyUrlCheck.accessible ? [] : [`Apply URL not accessible: ${applyUrlCheck.error}`],
      details: { apply_url: job.apply_url, accessible: applyUrlCheck.accessible },
    }
  }
  
  /**
   * Verify Recruitee job
   */
  private async verifyRecruitee(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    return {
      source_exists: true,
      job_exists: applyUrlCheck.accessible,
      data_consistent: applyUrlCheck.accessible,
      discrepancies: applyUrlCheck.accessible ? [] : [`Apply URL not accessible: ${applyUrlCheck.error}`],
      details: { apply_url: job.apply_url, accessible: applyUrlCheck.accessible },
    }
  }
  
  /**
   * Verify Personio job
   */
  private async verifyPersonio(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    return {
      source_exists: true,
      job_exists: applyUrlCheck.accessible,
      data_consistent: applyUrlCheck.accessible,
      discrepancies: applyUrlCheck.accessible ? [] : [`Apply URL not accessible: ${applyUrlCheck.error}`],
      details: { apply_url: job.apply_url, accessible: applyUrlCheck.accessible },
    }
  }
  
  /**
   * Verify Comeet job
   */
  private async verifyComeet(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    return {
      source_exists: true,
      job_exists: applyUrlCheck.accessible,
      data_consistent: applyUrlCheck.accessible,
      discrepancies: applyUrlCheck.accessible ? [] : [`Apply URL not accessible: ${applyUrlCheck.error}`],
      details: { apply_url: job.apply_url, accessible: applyUrlCheck.accessible },
    }
  }
  
  /**
   * Verify RemoteOK job
   */
  private async verifyRemoteOK(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    // RemoteOK API: https://remoteok.com/api
    const apiUrl = 'https://remoteok.com/api'
    const result = await this.fetchJson(apiUrl, 8000)
    
    if (!result.success) {
      return {
        source_exists: false,
        job_exists: false,
        data_consistent: false,
        discrepancies: [`Could not fetch RemoteOK data: ${result.error}`],
        details: { api_url: apiUrl, error: result.error },
      }
    }
    
    const jobs = (result.data || []).slice(1) // First item is metadata
    const atsJob = jobs.find((j: any) => j.id === job.source_id)
    
    if (!atsJob) {
      return {
        source_exists: true,
        job_exists: false,
        data_consistent: false,
        discrepancies: ['Job not found in RemoteOK'],
        details: { api_url: apiUrl, jobs_count: jobs.length },
      }
    }
    
    // Check data consistency
    if (atsJob.position && job.title && !this.fuzzyMatch(atsJob.position, job.title)) {
      discrepancies.push(`Title mismatch: ATS="${atsJob.position}" vs Job="${job.title}"`)
    }
    
    details.ats_job = {
      id: atsJob.id,
      position: atsJob.position,
      company: atsJob.company,
      location: atsJob.location,
    }
    
    return {
      source_exists: true,
      job_exists: true,
      data_consistent: discrepancies.length === 0,
      discrepancies,
      details,
    }
  }
  
  /**
   * Verify WeWorkRemotely job
   */
  private async verifyWeWorkRemotely(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    const applyUrlCheck = await this.checkUrlAccessible(job.apply_url, 8000)
    
    return {
      source_exists: true,
      job_exists: applyUrlCheck.accessible,
      data_consistent: applyUrlCheck.accessible,
      discrepancies: applyUrlCheck.accessible ? [] : [`Apply URL not accessible: ${applyUrlCheck.error}`],
      details: { apply_url: job.apply_url, accessible: applyUrlCheck.accessible },
    }
  }
  
  /**
   * Verify Himalayas job
   */
  private async verifyHimalayas(job: JobWithIntelligence, discrepancies: string[], details: Record<string, any>) {
    // Himalayas API: https://himalayas.app/jobs/api
    const apiUrl = 'https://himalayas.app/jobs/api'
    const result = await this.fetchJson(apiUrl, 8000)
    
    if (!result.success) {
      return {
        source_exists: false,
        job_exists: false,
        data_consistent: false,
        discrepancies: [`Could not fetch Himalayas data: ${result.error}`],
        details: { api_url: apiUrl, error: result.error },
      }
    }
    
    const jobs = result.data?.jobs || []
    const atsJob = jobs.find((j: any) => j.id === job.source_id)
    
    if (!atsJob) {
      return {
        source_exists: true,
        job_exists: false,
        data_consistent: false,
        discrepancies: ['Job not found in Himalayas'],
        details: { api_url: apiUrl, jobs_count: jobs.length },
      }
    }
    
    // Check data consistency
    if (atsJob.title && job.title && !this.fuzzyMatch(atsJob.title, job.title)) {
      discrepancies.push(`Title mismatch: ATS="${atsJob.title}" vs Job="${job.title}"`)
    }
    
    details.ats_job = {
      id: atsJob.id,
      title: atsJob.title,
      company: atsJob.companyName,
      location: atsJob.locationRestrictions?.join(', '),
    }
    
    return {
      source_exists: true,
      job_exists: true,
      data_consistent: discrepancies.length === 0,
      discrepancies,
      details,
    }
  }
  
  /**
   * Fuzzy match two strings (simple implementation)
   */
  private fuzzyMatch(str1: string, str2: string): boolean {
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()
    
    if (s1 === s2) return true
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) return true
    
    // Check word overlap
    const words1 = s1.split(/\s+/)
    const words2 = s2.split(/\s+/)
    const commonWords = words1.filter(w => words2.includes(w))
    
    return commonWords.length >= Math.min(2, Math.min(words1.length, words2.length) * 0.5)
  }
}
