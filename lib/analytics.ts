'use client'

import { track as vercelTrack } from '@vercel/analytics'

/**
 * Centralised, type-safe product analytics for Nexa.
 *
 * Why this file exists
 * --------------------
 * Sprinkling `track('something_clicked')` strings throughout the codebase
 * leads to drift: typos, duplicate event names, and inconsistent props.
 * A typed helper here means every event has exactly one canonical name and
 * a documented payload shape, so the funnel dashboards we build later
 * stay coherent without a heavy schema registry.
 *
 * Privacy posture
 * ---------------
 * - We only emit aggregated, non-identifying events (no email, no name,
 *   no CV content, no free-text).
 * - Job ids and slugs are public IDs already exposed in URLs, so they're
 *   safe to include for funnel analysis.
 * - Errors surface a coarse category (e.g. 'parse_failed'), never the
 *   raw error message.
 *
 * Backend
 * -------
 * Currently routed through `@vercel/analytics`'s `track()` (already a
 * project dependency, zero new SDK weight, respects DNT). Swapping in
 * PostHog or an additional sink later means changing one function — call
 * sites stay identical.
 */

// Discriminated event union — the source of truth for what Nexa tracks.
// Add new events here so TypeScript flags every untyped call site.
type NexaEvent =
  // Discovery
  | { name: 'home_view'; props?: Record<string, never> }
  | { name: 'jobs_index_view'; props?: { country?: string; category?: string } }
  | { name: 'role_view'; props: { jobId: string; slug: string; company: string; openToAfrica: boolean } }
  | { name: 'intent_page_view'; props: { slug: string; jobsShown: number } }
  | { name: 'company_page_view'; props: { slug: string } }
  | { name: 'guide_view'; props: { slug: string } }

  // Apply funnel
  | { name: 'apply_gate_click'; props: { jobId: string; state: 'anon' | 'authed-incomplete' | 'authed-complete' } }
  | { name: 'apply_outbound'; props: { jobId: string; slug: string } }

  // Save funnel
  | { name: 'save_job'; props: { jobId: string; saved: boolean } }
  | { name: 'save_job_failed'; props: { jobId: string; reason: string } }

  // Onboarding / CV funnel
  | { name: 'cv_upload_start'; props: { sizeKb: number } }
  | { name: 'cv_upload_success'; props: { sizeKb: number } }
  | { name: 'cv_upload_failed'; props: { reason: string } }
  | { name: 'onboarding_step_view'; props: { step: string } }
  | { name: 'onboarding_step_complete'; props: { step: string } }
  | { name: 'profile_complete'; props?: Record<string, never> }

  // Auth
  | { name: 'sign_in_start'; props: { method: 'magic_link' | 'google' } }
  | { name: 'sign_in_failed'; props: { method: 'magic_link' | 'google'; reason: string } }

  // Distribution
  | { name: 'share_click'; props: { kind: 'role' | 'profile' | 'company' | 'intent' | 'guide'; channel: 'whatsapp' | 'twitter' | 'copy' | 'native'; slug: string } }
  | { name: 'feed_card_click'; props: { jobId: string; position: number; surface: string } }

  // Profile reuse
  | { name: 'profile_cv_download'; props?: Record<string, never> }
  | { name: 'profile_snippet_copied'; props: { kind: 'summary' | 'experience' } }

/**
 * Track a Nexa product event.
 *
 * No-ops on the server, in dev, and when analytics is disabled — so call
 * sites can stay synchronous and never need to guard on environment.
 */
export function track<E extends NexaEvent>(event: E): void {
  if (typeof window === 'undefined') return

  // Defensive: respect Do Not Track. Vercel Analytics already does this,
  // but we double-check so future sinks inherit the same behaviour.
  if (typeof navigator !== 'undefined' && (navigator as Navigator & { doNotTrack?: string }).doNotTrack === '1') return

  try {
    vercelTrack(event.name, (event.props ?? {}) as Record<string, string | number | boolean | null>)
  } catch {
    // Analytics must never break the app — swallow.
  }
}
