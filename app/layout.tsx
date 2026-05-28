import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ogImage } from '@/lib/og'
import { siteUrl } from '@/lib/site'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

const defaultOg = ogImage({
  kind: 'default',
  title: 'Remote work for African talent',
  subtitle: 'Verified roles. Transparent pay. Direct apply.',
  meta: '1,500+ live remote roles \u00b7 Updated daily',
  badge: 'Open to Africa',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Nexa — Remote work for African talent',
    template: '%s · Nexa',
  },
  description:
    'Nexa helps African professionals find legitimate global remote work. Verified roles, transparent pay, no noise.',
  keywords: [
    'remote jobs',
    'Africa remote work',
    'global remote',
    'African talent',
    'tech jobs Africa',
  ],
  openGraph: {
    title: 'Nexa — Remote work for African talent',
    description:
      'Legitimate global remote work for African professionals. Verified roles, transparent pay.',
    url: siteUrl(),
    siteName: 'Nexa',
    type: 'website',
    images: [{ url: defaultOg, width: 1200, height: 630, alt: 'Nexa — Remote work for African talent' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexa',
    description: 'Remote work for African talent.',
    images: [defaultOg],
  },
  // Verification tokens are env-driven so the founder can add Search Console
  // / Bing / Yandex without a code change. Empty values are skipped by Next.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    yandex: process.env.YANDEX_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  // Allow pinch-zoom (a11y) but cap at 5× so accidental gestures
  // don't lock users into a half-zoomed "desktop view" state.
  maximumScale: 5,
  // Cover the full physical viewport including notch / status bar
  // areas. Without this, some Android browsers leave a thin band
  // that triggers desktop-site auto-zoom heuristics.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${geistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased min-h-dvh">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
