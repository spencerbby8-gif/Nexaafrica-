import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// [FIX #10] Removed WebSocket polyfill - service client only needs HTTP operations
// in serverless functions. Realtime/WebSocket support is not used.

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE service role env vars')
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
