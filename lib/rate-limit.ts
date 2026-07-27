import { NextRequest, NextResponse } from 'next/server'

/**
 * Simple in-memory rate limiter for API endpoints
 * In production, use Redis or a distributed store
 */

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  })
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (req: NextRequest) => string // Custom key generator
}

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator } = config

  return async (req: NextRequest): Promise<NextResponse | null> => {
    const key = keyGenerator ? keyGenerator(req) : req.ip || 'unknown'
    const now = Date.now()

    // Initialize or reset window
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs
      }
    }

    // Increment counter
    store[key].count++

    // Check if limit exceeded
    if (store[key].count > maxRequests) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000)
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(store[key].resetTime).toISOString()
          }
        }
      )
    }

    // Add rate limit headers
    const remaining = maxRequests - store[key].count
    
    // Store headers in request for later use
    ;(req as any).rateLimitHeaders = {
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(store[key].resetTime).toISOString()
    }

    return null // Allow request to proceed
  }
}

// Pre-configured rate limiters for different endpoints
export const intelligenceRateLimiters = {
  // Single job analysis: 10 requests per minute
  analyze: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
      const userId = req.headers.get('x-user-id') || 'anonymous'
      return `analyze:${ip}:${userId}`
    }
  }),

  // Batch analysis: 5 requests per minute
  batch: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 5,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
      const userId = req.headers.get('x-user-id') || 'anonymous'
      return `batch:${ip}:${userId}`
    }
  }),

  // GET requests: 30 requests per minute
  get: rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
      return `get:${ip}`
    }
  })
}

/**
 * Middleware wrapper to apply rate limiting to API routes
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  limiter: (req: NextRequest) => Promise<NextResponse | null>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Check rate limit
    const rateLimitResponse = await limiter(req)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Call handler
    const response = await handler(req)

    // Add rate limit headers
    const headers = (req as any).rateLimitHeaders
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value as string)
      })
    }

    return response
  }
}
