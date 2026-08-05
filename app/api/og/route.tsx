import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { siteHost } from '@/lib/site'

// [TRUTH LAYER v1] Node runtime + force-dynamic. The route was edge and
// carried `revalidate`, which makes Next attempt a build-time prerender of a
// request-dependent handler — every deployment served a cached build-time
// failure (persistent HTTP 500 regardless of code fixes; observed on BOTH the
// production and preview deployments, with two different render codebases).
// Node runtime matches the probe-proven render path; CDN caching is carried
// by the explicit Cache-Control header on the response below.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630

// Brand tokens duplicated as raw values because next/og can't read CSS variables.
// Keep these in sync with globals.css if the brand palette ever changes.
const BG = '#0a0a0a'
const FG = '#fafafa'
const MUTED = '#a1a1aa'
const ACCENT = '#34d399' // calm green — Nexa signature
const BORDER = '#27272a'

type Params = {
  kind: 'role' | 'intent' | 'company' | 'guide' | 'profile' | 'default'
  title: string
  subtitle?: string
  meta?: string // small label, e.g. "Open to Africa · USD · Engineering"
  badge?: string // top-right pill text, e.g. "Open to Africa"
}

function clamp(s: string | undefined | null, max: number): string {
  if (!s) return ''
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1) + '\u2026'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kind = (searchParams.get('kind') as Params['kind']) || 'default'
  const title = clamp(searchParams.get('title') || 'Nexa', 110)
  const subtitle = clamp(searchParams.get('subtitle') || '', 130)
  const meta = clamp(searchParams.get('meta') || '', 80)
  const badge = clamp(searchParams.get('badge') || '', 32)

  const kindLabel: Record<Params['kind'], string> = {
    role: 'Remote role',
    intent: 'Remote jobs',
    company: 'Hiring on Nexa',
    guide: 'Guide',
    profile: 'Verified profile',
    default: 'Nexa',
  }

  try {
    const img = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: BG,
          color: FG,
          padding: '64px 72px',
          position: 'relative',
        }}
      >
        {/* Subtle ambient gradient bloom (no flashy gradients on body) */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: 9999,
            background: 'rgba(52, 211, 153, 0.08)',
            display: 'flex',
          }}
        />

        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: ACCENT,
                color: BG,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: -1,
              }}
            >
              N
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: -0.5,
                display: 'flex',
              }}
            >
              Nexa
            </div>
            <div
              style={{
                fontSize: 18,
                color: MUTED,
                marginLeft: 12,
                paddingLeft: 14,
                borderLeft: `1px solid ${BORDER}`,
                display: 'flex',
              }}
            >
              {kindLabel[kind]}
            </div>
          </div>

          {badge ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid rgba(52, 211, 153, 0.33)',
                background: 'rgba(52, 211, 153, 0.08)',
                color: ACCENT,
                fontSize: 18,
                fontWeight: 500,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: ACCENT,
                  display: 'flex',
                }}
              />
              {badge}
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
        </div>

        {/* Body — flex-grow pushes footer to bottom */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flexGrow: 1,
            paddingTop: 32,
            paddingBottom: 32,
          }}
        >
          <div
            style={{
              fontSize: title.length > 60 ? 56 : 68,
              lineHeight: 1.08,
              fontWeight: 700,
              letterSpacing: -1.5,
              color: FG,
              display: 'flex',
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 22,
                fontSize: 28,
                lineHeight: 1.4,
                color: MUTED,
                display: 'flex',
                maxWidth: 1000,
              }}
            >
              {subtitle}
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
        </div>

        {/* Footer row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 24,
          }}
        >
          <div style={{ display: 'flex', fontSize: 20, color: MUTED }}>
            {meta || 'Remote work for African talent'}
          </div>
          <div style={{ display: 'flex', fontSize: 20, color: MUTED }}>
            {siteHost()}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
    )
    // Force the render NOW: next/og defers satori work to stream
    // consumption, which escapes a constructor-level try/catch and was the
    // structural reason the production 500 survived the copy fix. Buffering
    // here makes any render failure catchable -> honest SVG fallback.
    const buf = await img.arrayBuffer()
    return new Response(buf, {
      headers: {
        'Content-Type': img.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
      },
    })
  } catch (err) {
    // Minimal brand card fallback — satori failures must degrade, not 500.
    console.error('[og] ImageResponse failed', (err as Error)?.message)
    const svg = `<!--og-fallback--><svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="${BG}"/><text x="72" y="${HEIGHT / 2}" fill="${FG}" font-family="system-ui, sans-serif" font-size="64" font-weight="700">Nexa</text><text x="72" y="${HEIGHT / 2 + 56}" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="28">Remote work for African talent</text></svg>`
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    })
  }
}
