"use client"

import { useState, useTransition } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

/**
 * Sign-out button with a calm confirmation step. Posts to /auth/sign-out
 * (which clears Supabase cookies), then performs a hard navigation. The hard
 * navigation flushes the Next.js client RSC cache so subsequent renders no
 * longer show authenticated state.
 */
export function SignOutButton() {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)

  const onConfirm = () => {
    start(async () => {
      try {
        await fetch("/auth/sign-out", {
          method: "POST",
          credentials: "same-origin",
          redirect: "manual",
        })
      } catch {
        // Even if the request fails (offline, etc.), still hard-navigate.
      }
      window.location.assign("/")
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={pending}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {pending ? "Signing out\u2026" : "Sign out"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Sign out of Nexa?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            You&apos;ll need to sign in again to view your profile or apply to roles. Your
            saved profile stays on Nexa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? "Signing out\u2026" : "Sign out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
