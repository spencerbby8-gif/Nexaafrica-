import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS.
 * Use ONLY in server-side route handlers / scripts. Never import from a client component.
 */
export function createServiceClient() {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ''
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET ??
    ''
  if (!url || !key) {
    throw new Error('Missing SUPABASE service role env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
