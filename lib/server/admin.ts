import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { isAdminUser } from './admin-policy'

export async function requireAdmin(path: string) {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) redirect(`/sign-in?next=${encodeURIComponent(path)}`)
  if (!isAdminUser(user, process.env.ADMIN_EMAILS)) notFound()
  return user
}
