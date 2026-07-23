import type { NormalizedJob } from "../normalize"

export type ConnectorCategory =
  | "ats"
  | "job_board"
  | "remote_board"
  | "company_direct"
  | "aggregator"

export type ConnectorQuality = "premium" | "verified" | "standard" | "experimental"

export interface ConnectorMeta {
  id: string // unique e.g. greenhouse:gitlab
  ats: string
  slug: string // board identifier
  company: string
  logo?: string | null
  category: ConnectorCategory
  quality: ConnectorQuality
  regions: string[] // e.g. ["global", "africa-friendly", "us", "emea"]
  tags: string[] // e.g. ["engineering", "remote-first"]
  rateLimitMs?: number // ms between requests
  enabled: boolean
  trustScore: number // 0-100, based on historical success
}

export interface ConnectorResult {
  jobs: NormalizedJob[]
  fetchedAt: string
  durationMs: number
  sourceHealth: {
    ok: boolean
    error?: string
    fetched: number
  }
}

export interface Connector {
  meta: ConnectorMeta
  fetch(): Promise<ConnectorResult>
}

// Normalized job schema that every connector must produce (same as NormalizedJob)
export type { NormalizedJob } from "../normalize"
