import { createClient as createSupabaseClient } from '@supabase/supabase-js'
// @ts-ignore
import ws from 'ws'

if (typeof globalThis !== 'undefined' && !(globalThis as any).WebSocket) {
  ;(globalThis as any).WebSocket = ws
}
if (typeof global !== 'undefined' && !(global as any).WebSocket) {
  ;(global as any).WebSocket = ws
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE service role env vars')
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      WebSocket: ws as any,
      fetch: fetch as any,
    },
    realtime: {
      transport: ws as any,
    },
  } as any)
}
