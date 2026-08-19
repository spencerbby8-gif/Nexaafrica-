import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * HTTP 404 integrity guards (Phase 1, 2026-08-19).
 *
 * Root cause proven in production + local repro: any loading.tsx boundary
 * makes Next.js flush the streaming shell (HTTP 200 + fallback) BEFORE an
 * async page can throw notFound(). The not-found UI then only arrives as an
 * RSC flight chunk, the status stays 200, and (when generateMetadata already
 * resolved) restricted content leaks into the head/flight payload.
 *
 * Invariants below keep that defect from silently returning:
 *   1. No loading.tsx may sit above a route that calls notFound().
 *   2. Dynamic content routes must notFound() inside generateMetadata too,
 *      so no restricted title/meta can flush before the 404 fires.
 */

const APP = join(process.cwd(), 'app')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function segmentDirOf(pageOrLoadingFile: string): string {
  const base = pageOrLoadingFile.includes('/page.tsx') ? '/page.tsx' : '/loading.tsx'
  return pageOrLoadingFile.slice(0, -base.length)
}

function isAncestorOrSelf(ancestor: string, dir: string): boolean {
  const rel = relative(ancestor, dir)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}

describe('HTTP 404 integrity — loading boundaries', () => {
  const loadingFiles = walk(APP).filter((f) => /loading\.tsx$/.test(f))
  const pagesWithNotFound = walk(APP)
    .filter((f) => /page\.tsx$/.test(f))
    .filter((f) => /\bnotFound\(\)/.test(readFileSync(f, 'utf8')))
    .map(segmentDirOf)

  it('no loading.tsx sits above (or beside) a route that calls notFound()', () => {
    const violations: string[] = []
    for (const loading of loadingFiles) {
      const segment = segmentDirOf(loading)
      for (const page of pagesWithNotFound) {
        if (isAncestorOrSelf(segment, page)) {
          violations.push(`${relative(APP, loading)} shadows ${relative(APP, page)}/page.tsx`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('root app/loading.tsx stays removed (it shadowed every dynamic route)', () => {
    expect(existsSync(join(APP, 'loading.tsx'))).toBe(false)
  })
})

describe('HTTP 404 integrity — metadata never leaks restricted content', () => {
  const routes = [
    'app/role/[slug]/page.tsx',
    'app/guides/[slug]/page.tsx',
    'app/companies/[slug]/page.tsx',
  ]

  for (const route of routes) {
    it(`${route} notFound()s inside generateMetadata before returning metadata`, () => {
      const src = readFileSync(join(process.cwd(), route), 'utf8')
      const metaFn = src.slice(
        src.indexOf('export async function generateMetadata'),
        src.indexOf('export default'),
      )
      expect(metaFn).toContain('notFound()')
    })
  }

  it('role page never returns restricted-job metadata (no leaky early-return)', () => {
    const src = readFileSync(join(process.cwd(), 'app/role/[slug]/page.tsx'), 'utf8')
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    )
    // The old leaky branch returned { title: job.title, robots... } for
    // restricted jobs. Metadata for a job that 404s must never be produced.
    expect(metaFn).not.toMatch(/eligibility === 'restricted'[\s\S]{0,120}return \{/)
  })
})
