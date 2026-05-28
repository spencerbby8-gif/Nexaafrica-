import Link from "next/link"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

export async function Navbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link
          href="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <Link
            href="/jobs"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Jobs
          </Link>
          {user && (
            <>
              <Link
                href="/saved"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Saved
              </Link>
              <Link
                href="/profile"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Profile
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/profile">Profile</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link href="/jobs">Browse jobs</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
