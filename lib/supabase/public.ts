import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cookie-free, read-only Supabase client for PUBLIC, cacheable routes
 * (sitemap, RSS, fully-static SEO pages).
 *
 * Unlike `lib/supabase/server.ts`, this client does NOT touch `cookies()`.
 * Reading cookies opts a route into fully dynamic rendering, which would
 * defeat ISR/`revalidate` and force a live database round-trip on every
 * crawler request — a reliability risk that surfaces in Search Console as
 * "Couldn't fetch". Because the sitemap only reads public, non-user-scoped
 * data, the anon client is the correct, cacheable choice.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
