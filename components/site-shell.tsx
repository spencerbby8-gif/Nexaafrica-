import { Navbar } from '@/components/navbar'
import { MobileNav } from '@/components/mobile-nav'
import { SiteFooter } from '@/components/site-footer'

export async function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Navbar is an async Server Component. */}
      <Navbar />
      <main id="main" className="flex-1">
        {children}
      </main>
      {/* Footer renders on every viewport so SEO crawl depth + internal
          linking remain identical across devices. The footer itself
          adapts its layout (compact accordion on mobile, full grid on
          desktop) and pads its bottom on mobile to clear the sticky
          bottom nav. */}
      <div className="pb-20 md:pb-0">
        <SiteFooter />
      </div>
      <MobileNav />
    </div>
  )
}
