'use client'

import { jobFilterParams } from '@/lib/jobs/filters'
import { useState, useCallback, useRef, useEffect } from 'react'
import type { JobWithAI } from '@/lib/ai/queries'
import type { Job, JobFilters } from '@/lib/types'

interface UseJobFeedOptions {
  initialJobs: JobWithAI<Job>[]
  initialHasMore?: boolean
  initialCursor: string | null
  filters?: JobFilters
  pageSize?: number
}

interface UseJobFeedReturn {
  jobs: JobWithAI<Job>[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
}

export function useJobFeed({
  initialJobs,
  initialCursor,
  initialHasMore,
  filters = {},
  pageSize = 20,
}: UseJobFeedOptions): UseJobFeedReturn {
  const [jobs, setJobs] = useState<JobWithAI<Job>[]>(initialJobs)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [hasMore, setHasMore] = useState(initialHasMore ?? Boolean(initialCursor))
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const loadingRef = useRef(false)
  
  const loadMore = useCallback(async () => {
    // Prevent concurrent loads
    if (loadingRef.current || !hasMore || !cursor) {
      return
    }
    
    loadingRef.current = true
    setIsLoadingMore(true)
    setError(null)
    
    try {
      // Build query params
      const params = jobFilterParams(filters)
      params.set('cursor', cursor)
      params.set('limit', String(pageSize))
      
      const response = await fetch(`/api/jobs?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`Failed to load more jobs: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Append new jobs
      setJobs(prev => { const ids=new Set(prev.map(j=>j.id)); return [...prev, ...data.jobs.filter((j: Job)=>!ids.has(j.id))] })
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      console.error('[useJobFeed] loadMore error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load more jobs')
    } finally {
      setIsLoadingMore(false)
      loadingRef.current = false
    }
  }, [cursor, hasMore, filters, pageSize])
  
  // Reset when filters change
  useEffect(() => {
    setJobs(initialJobs)
    setCursor(initialCursor)
    setHasMore(initialHasMore ?? Boolean(initialCursor))
    setError(null)
  }, [initialJobs, initialCursor, initialHasMore, pageSize])
  
  return {
    jobs,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}
