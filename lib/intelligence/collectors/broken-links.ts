/**
 * Broken Links Collector
 * Checks if apply URL and other links are accessible
 */

import { BaseEvidenceCollector } from './base'
import type { Evidence, EvidenceType } from '../types'
import type { Job } from '@/lib/types'

export class BrokenLinksCollector extends BaseEvidenceCollector {
  type: EvidenceType = 'broken_links'
  
  async collect(job: Job): Promise<Evidence> {
    const startTime = Date.now()
    
    try {
      const linksToCheck: Array<{ name: string; url: string }> = []
      
      // Add apply URL
      if (job.apply_url) {
        linksToCheck.push({ name: 'Apply URL', url: job.apply_url })
      }
      
      // Note: company_website is not available on Job type, only on JobWithIntelligence
      // Skipping company website check for now
      
      if (linksToCheck.length === 0) {
        return this.createEvidence(
          job,
          {
            links_checked: 0,
            reason: 'No links to check',
          },
          'failed',
          0,
          'No links available to check',
          undefined,
          'Broken Links Check'
        )
      }
      
      // Check all links
      const results = await Promise.all(
        linksToCheck.map(async (link) => {
          const check = await this.checkUrlAccessible(link.url, 8000)
          return {
            name: link.name,
            url: link.url,
            accessible: check.accessible,
            status_code: check.status,
            error: check.error,
          }
        })
      )
      
      // Calculate statistics
      const totalLinks = results.length
      const accessibleLinks = results.filter(r => r.accessible).length
      const brokenLinks = results.filter(r => !r.accessible)
      
      // Calculate confidence
      const confidence = (accessibleLinks / totalLinks) * 100
      
      // Determine status
      const status = accessibleLinks === totalLinks
        ? 'verified'
        : accessibleLinks > 0
        ? 'partial'
        : 'failed'
      
      // Create summary
      const summary = brokenLinks.length === 0
        ? `All ${totalLinks} links accessible`
        : `${brokenLinks.length} of ${totalLinks} links broken: ${brokenLinks.map(l => l.name).join(', ')}`
      
      return this.createEvidence(
        job,
        {
          links_checked: totalLinks,
          links_accessible: accessibleLinks,
          links_broken: brokenLinks.length,
          link_results: results,
          check_duration_ms: Date.now() - startTime,
        },
        status,
        confidence,
        summary,
        undefined,
        'Broken Links Check'
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
        `Broken links check failed: ${error.message}`,
        undefined,
        'Broken Links Check'
      )
    }
  }
}
