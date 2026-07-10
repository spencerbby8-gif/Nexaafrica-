/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // SEO God Mode requires failing fast on type drift — never suppress.
    ignoreBuildErrors: false,
  },
  images: {
    // Re-enable Next.js optimization for LCP and crawl performance.
    // Company logos come from many ATS hosts + external URLs — allow any https.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default nextConfig
