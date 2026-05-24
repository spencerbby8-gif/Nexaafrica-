import { Navbar } from '@/components/navbar'
import { MobileNav } from '@/components/mobile-nav'
import { SiteFooter } from '@/components/site-footer'

export async function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Navbar is an async Server Component. */}
      <Navbar />
      <main id="main" className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileNav />
    </div>
  )
}
