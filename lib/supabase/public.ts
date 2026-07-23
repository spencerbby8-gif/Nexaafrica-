import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cookie-free, read-only Supabase client for PUBLIC routes (sitemap, RSS,
 * static SEO surfaces).
 *
 * Env resolution is deliberately tolerant. Inside Next.js *metadata routes*
 * (e.g. the compiled `sitemap--route-entry.js`) the build-time-inlined
 * `NEXT_PUBLIC_*` variables were observed to be undefined at runtime in this
 * deployment, which made the Supabase client throw "supabaseUrl is required"
 * and 500 the sitemap ("Couldn't fetch" in Search Console). The non-public
 * twins (`SUPABASE_URL` / `SUPABASE_ANON_KEY`) are plain server-runtime vars
 * that are reliably present, so we prefer them and fall back to the public
 * names. This avoids reading cookies (no dynamic-render requirement) and is
 * the correct, cacheable choice because the sitemap only reads public data.
 */
export function createPublicClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''

  // SEO God Mode: sitemap must never 500 because env missing at build time.
  // If env is absent, caller should handle degraded mode. Throw explicit error
  // so fetchSitemapData can return static-only sitemap.
  if (!url || !key) {
    throw new Error('Missing Supabase env for public client (SUPABASE_URL / ANON_KEY)')
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
