import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
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

export const metadata: Metadata = {
  metadataBase: new URL('https://nexa.africa'),
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
    url: 'https://nexa.africa',
    siteName: 'Nexa',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexa',
    description: 'Remote work for African talent.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
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
