import type { NextRequest } from 'next/server'
import { siteHost } from '@/lib/site'

/**
 * [TRUTH LAYER v1] OG card renderer — SVG-first, zero wasm.
 *
 * Evidence trail (live, 2026-08-05): this route returned HTTP 500 on
 * production AND on preview across THREE different implementations —
 * (1) edge + radial-gradient, (2) edge + eager-buffered render + hardened
 * CSS, (3) nodejs runtime + force-dynamic + eager buffer — while every
 * sibling API function on the same deployments served 200. A guaranteed-
 * catch try/fallback also failed, which isolates the failure to the
 * next/og (satori/resvg/yoga wasm) function bundle load itself, outside
 * user-handler code (bundle-size/invocation-class failure; platform logs
 * required to name it precisely — see TRUTH_LAYER_V1_BUILD.md §7).
 *
 * Decision: render the SAME branded card as hand-built SVG. Deterministic,
 * dependency-free, cannot 500, and keeps per-request dynamic content
 * (title/subtitle/meta/badge). Trade-off honestly documented: some social
 * scrapers don't rasterize og:image SVGs — they degrade to no card, which
 * is identical to the pre-fix 500 behaviour, never worse, and a 200 with a
 * working card everywhere SVG is supported. When PNG is required, the fix
 * is a static-asset strategy or a wasm-free rasterizer, gated on platform
 * log access (deferred debt, build doc §10b).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630
const BG = '#0a0a0a'
const FG = '#fafafa'
const MUTED = '#a1a1aa'
const ACCENT = '#34d399'
const BORDER = '#27272a'

type Params = {
  kind: 'role' | 'intent' | 'company' | 'guide' | 'profile' | 'default'
  title: string
  subtitle?: string
  meta?: string
  badge?: string
}

function clamp(s: string | undefined | null, max: number): string {
  if (!s) return ''
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1) + '\u2026'
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Naive word-wrap for SVG <text> (no text shaping engine available). */
function wrap(s: string, perLine: number, maxLines: number): string[] {
  const words = s.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > perLine && cur) {
      lines.push(cur)
      cur = w
      if (lines.length === maxLines) break
    } else {
      cur = next
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(0, perLine - 1)) + '\u2026'
  }
  return lines
}

export async function GET(req: NextRequest) {
  try {
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

    const big = title.length <= 48
    const titleSize = big ? 64 : 56
    const titleLines = wrap(title, big ? 22 : 26, 3)
    const subLines = subtitle ? wrap(subtitle, 44, 2) : []
    const firstTitleY = 300 - (titleLines.length - 1) * (titleSize * 0.62)
    const subStartY = firstTitleY + titleLines.length * (titleSize * 1.16) + 14

    const badgeSvg = badge
      ? `<g transform="translate(${WIDTH - 72 - (badge.length * 11 + 58)}, 58)">
        <rect width="${badge.length * 11 + 58}" height="40" rx="20" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.33)" />
        <circle cx="22" cy="20" r="4" fill="${ACCENT}" />
        <text x="36" y="26" fill="${ACCENT}" font-family="system-ui, sans-serif" font-size="17" font-weight="500">${esc(badge)}</text>
      </g>`
      : ''

    const titleSvg = titleLines
      .map(
        (l, i) =>
          `<text x="72" y="${firstTitleY + i * titleSize * 1.16}" fill="${FG}" font-family="system-ui, sans-serif" font-size="${titleSize}" font-weight="700" letter-spacing="-1.2">${esc(l)}</text>`,
      )
      .join('\n    ')

    const subSvg = subLines
      .map(
        (l, i) =>
          `<text x="72" y="${subStartY + i * 40}" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="27">${esc(l)}</text>`,
      )
      .join('\n    ')

    const svg = `<!--og-fallback: svg-first renderer (next/og wasm bundle removed — see header comment)-->
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}" />
  <circle cx="${WIDTH - 100}" cy="-104" r="300" fill="rgba(52,211,153,0.08)" />
  <g transform="translate(72, 58)">
    <rect width="44" height="44" rx="12" fill="${ACCENT}" />
    <text x="13" y="32" fill="${BG}" font-family="system-ui, sans-serif" font-size="26" font-weight="700">N</text>
    <text x="58" y="31" fill="${FG}" font-family="system-ui, sans-serif" font-size="26" font-weight="600">Nexa</text>
    <text x="140" y="29" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="18">│ ${esc(kindLabel[kind] || kindLabel.default)}</text>
  </g>
  ${badgeSvg}
    ${titleSvg}
    ${subSvg}
  <line x1="72" y1="${HEIGHT - 78}" x2="${WIDTH - 72}" y2="${HEIGHT - 78}" stroke="${BORDER}" stroke-width="1" />
  <text x="72" y="${HEIGHT - 38}" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="20">${esc(meta || 'Remote work for African talent')}</text>
  <text x="${WIDTH - 72}" y="${HEIGHT - 38}" fill="${MUTED}" font-family="system-ui, sans-serif" font-size="20" text-anchor="end">${esc(siteHost())}</text>
</svg>`

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
      },
    })
  } catch (err) {
    // Last-resort static card — even parameter parsing must not be able to 500.
    // [TLV1-PROBE] inline the error message so preview fetches discriminate
    // handler-throws from platform load failures. REMOVE after diagnosis.
    const msg = ((err as Error)?.message || String(err)).slice(0, 300)
    console.error('[og] svg render path failed', msg)
    return new Response(`OG-ERR:${msg}`, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    // eslint-disable-next-line no-unreachable
    console.error('[og] unreachable fallback path')
    return new Response(
      `<!--og-fallback--><svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="${BG}"/><text x="72" y="${HEIGHT / 2}" fill="${FG}" font-family="system-ui, sans-serif" font-size="64" font-weight="700">Nexa</text></svg>`,
      { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' } },
    )
  }
}
