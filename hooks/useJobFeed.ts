'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { JobWithAI } from '@/lib/ai/queries'
import type { Job } from '@/lib/types'

interface UseJobFeedOptions {
  initialJobs: JobWithAI<Job>[]
  initialCursor: string | null
  filters?: {
    category?: string
    country?: string
    remote?: boolean
    africa?: boolean
    usd?: boolean
    employmentType?: string
    q?: string
  }
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
  filters = {},
  pageSize = 20,
}: UseJobFeedOptions): UseJobFeedReturn {
  const [jobs, setJobs] = useState<JobWithAI<Job>[]>(initialJobs)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [hasMore, setHasMore] = useState(initialJobs.length === pageSize)
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
      const params = new URLSearchParams()
      params.set('cursor', cursor)
      params.set('limit', String(pageSize))
      
      if (filters.category) params.set('category', filters.category)
      if (filters.country) params.set('country', filters.country)
      if (filters.remote) params.set('remote', '1')
      if (filters.africa) params.set('africa', '1')
      if (filters.usd) params.set('usd', '1')
      if (filters.employmentType) params.set('employment_type', filters.employmentType)
      if (filters.q) params.set('q', filters.q)
      
      const response = await fetch(`/api/jobs?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`Failed to load more jobs: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Append new jobs
      setJobs(prev => [...prev, ...data.jobs])
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
    setHasMore(initialJobs.length === pageSize)
    setError(null)
  }, [initialJobs, initialCursor, pageSize])
  
  return {
    jobs,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  }
}
