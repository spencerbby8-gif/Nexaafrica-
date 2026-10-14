/** Only server-controlled app metadata and explicitly configured, verified emails grant admin access. */
export function isAdminUser(
  user: { email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> } | null,
  configuredEmails: string = '',
): boolean {
  if (!user) return false
  if (user.app_metadata?.role === 'admin') return true
  const allowed = configuredEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
  return Boolean(user.email_confirmed_at && user.email && allowed.includes(user.email.toLowerCase()))
}
