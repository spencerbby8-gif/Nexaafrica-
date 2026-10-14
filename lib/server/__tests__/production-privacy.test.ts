import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { isAdminUser } from '../admin-policy'
import { toSharedProfile } from '@/lib/profile/public'

describe('admin access fails closed', () => {
  it('denies missing and ordinary users', () => {
    expect(isAdminUser(null, 'owner@example.test')).toBe(false)
    expect(isAdminUser({ email: 'user@example.test', email_confirmed_at: '2026-01-01' }, '')).toBe(false)
    expect(isAdminUser({ email: 'user@example.test', app_metadata: { role: 'user' } }, 'owner@example.test')).toBe(false)
  })
  it('requires a verified email for explicit email grants', () => {
    expect(isAdminUser({ email: 'owner@example.test' }, 'owner@example.test')).toBe(false)
    expect(isAdminUser({ email: 'OWNER@example.test', email_confirmed_at: '2026-01-01' }, ' owner@example.test ')).toBe(true)
  })
  it('accepts only the server-controlled admin role', () => {
    expect(isAdminUser({ app_metadata: { role: 'admin' } })).toBe(true)
    expect(isAdminUser({ app_metadata: { role: 'administrator' } })).toBe(false)
    expect(isAdminUser({ user_metadata: { role: 'admin' } } as any)).toBe(false)
  })
  it('guards every existing admin page before its service-role reads', () => {
    for (const directory of readdirSync('app/admin', { withFileTypes: true }).filter(x => x.isDirectory())) {
      const text = readFileSync(`app/admin/${directory.name}/page.tsx`, 'utf8')
      expect(text).toContain(`await requireAdmin("/admin/${directory.name}")`)
      expect(text.indexOf('await requireAdmin(')).toBeLessThan(text.lastIndexOf('createServiceClient()'))
    }
  })
})

describe('public sharing allowlist', () => {
  it('does not serialize owner-only fields, even if an upstream query includes them', () => {
    const privateRow = { full_name: 'Example', country: 'Nigeria', headline: 'Engineer', summary: 'Public summary', id: 'private-id', raw_cv_text: 'PRIVATE-CV-CONTENT', cv_storage_path: 'PRIVATE-STORAGE-PATH', share_token: 'PRIVATE-TOKEN', future_private_field: 'PRIVATE' }
    const publicRow = toSharedProfile(privateRow)
    expect(Object.keys(publicRow).sort()).toEqual(['country','full_name','headline','summary'])
    expect(JSON.stringify(publicRow)).not.toContain('PRIVATE')
  })
  it('uses an explicit query projection and a dedicated public renderer', () => {
    const page = readFileSync('app/p/[token]/page.tsx', 'utf8')
    expect(page).not.toContain('.select("*")')
    expect(page).not.toContain('ProfileView')
    expect(page).toContain('profile={toSharedProfile(profile)}')
    const renderer = readFileSync('components/shared-profile.tsx', 'utf8')
    expect(renderer).not.toMatch(/^['"]use client['"]/)
    expect(renderer).not.toContain('BeforeAfterComparison')
  })
  it('has a non-destructive migration that closes both public roles', () => {
    const sql = readFileSync('supabase/migrations/20261014000100_production_privacy_boundary.sql', 'utf8')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).not.toMatch(/\b(?:DELETE FROM|TRUNCATE|DROP TABLE)\b/i)
    for (const name of ['ats_result','skill_categorization','metrics']) expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${name} jsonb`)
  })
})
