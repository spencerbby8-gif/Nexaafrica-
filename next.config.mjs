/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // SEO God Mode: never suppress type drift — drift must fail the build
    ignoreBuildErrors: false,
  },
  images: {
    // Enable Next image optimization for Core Web Vitals LCP
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  compress: true,
  poweredByHeader: false,
  // Keep rewrites/redirects explicit for canonical SEO
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default nextConfig
