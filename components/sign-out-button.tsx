"use client"

import { useTransition } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Sign-out button. Posts to /auth/sign-out (which clears Supabase cookies),
 * then performs a hard navigation to the home page. The hard navigation is
 * required because Next.js's client router cache holds RSC payloads that
 * still render the authenticated state otherwise.
 */
export function SignOutButton() {
  const [pending, start] = useTransition()

  const onClick = () => {
    start(async () => {
      try {
        await fetch("/auth/sign-out", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
        })
      } catch {
        // Even if the request fails (offline, etc.), still hard-navigate.
        // The user clearly wants to leave.
      }
      // Hard navigation flushes the RSC cache and forces a fresh server render
      // with the cleared session cookies.
      window.location.assign("/")
    })
  }

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending}
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
    >
      <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      {pending ? "Signing out\u2026" : "Sign out"}
    </Button>
  )
}
