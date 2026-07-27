'use client'

import { useEffect, useRef } from 'react'
import { JobCard } from '@/components/job-card'
import { EmptyState } from '@/components/empty-state'
import { useJobFeed } from '@/hooks/useJobFeed'
import type { JobWithAI } from '@/lib/ai/queries'
import type { Job } from '@/lib/types'

interface JobFeedProps {
  // New props for infinite scroll mode
  initialJobs?: JobWithAI<Job>[]
  initialCursor?: string | null
  filters?: {
    category?: string
    country?: string
    remote?: boolean
    africa?: boolean
    usd?: boolean
    employmentType?: string
    q?: string
  }
  // Legacy props for static mode
  jobs?: (Job | JobWithAI<Job>)[]
  empty?: React.ReactNode
  showOpportunityIntelligence?: boolean
}

export function JobFeed({
  initialJobs,
  initialCursor,
  filters,
  jobs: staticJobs,
  empty,
  showOpportunityIntelligence = true,
}: JobFeedProps) {
  // Determine if we're in infinite scroll mode or static mode
  const isInfiniteScrollMode = initialJobs !== undefined
  
  const { jobs: infiniteJobs, isLoadingMore, error, hasMore, loadMore } = useJobFeed({
    initialJobs: initialJobs || [],
    initialCursor: initialCursor || null,
    filters,
    pageSize: 20,
  })
  
  const jobs = isInfiniteScrollMode ? infiniteJobs : (staticJobs || [])
  
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  
  // Set up IntersectionObserver for infinite scroll (only in infinite scroll mode)
  useEffect(() => {
    if (!isInfiniteScrollMode) return
    
    if (observerRef.current) {
      observerRef.current.disconnect()
    }
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )
    
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [isInfiniteScrollMode, hasMore, isLoadingMore, loadMore])
  
  if (jobs.length === 0) {
    return (
      empty ?? (
        <EmptyState
          title="No roles match this view yet."
          body="New roles are added regularly. Try a broader search or browse a related category."
          suggestions={[
            { label: 'All remote jobs', href: '/jobs' },
            { label: 'Open to Africa', href: '/jobs?africa=1' },
            { label: 'Remote engineering', href: '/jobs/engineering/worldwide' },
          ]}
        />
      )
    )
  }
  
  return (
    <div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {jobs.map((job) => {
          const withAI = job as JobWithAI<Job>
          return (
            <li key={job.id} className="min-w-0">
              <JobCard
                job={job}
                aiIntelligence={withAI.aiIntelligence || null}
                showOpportunityIntelligence={showOpportunityIntelligence}
              />
            </li>
          )
        })}
      </ul>
      
      {/* Load more trigger (only in infinite scroll mode) */}
      {isInfiniteScrollMode && hasMore && (
        <div ref={loadMoreRef} className="mt-8 flex justify-center">
          {isLoadingMore && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span>Loading more jobs...</span>
            </div>
          )}
        </div>
      )}
      
      {/* Error message (only in infinite scroll mode) */}
      {isInfiniteScrollMode && error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      
      {/* End of list message (only in infinite scroll mode) */}
      {isInfiniteScrollMode && !hasMore && jobs.length > 0 && (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          You've reached the end of the job listings.
        </div>
      )}
    </div>
  )
}
