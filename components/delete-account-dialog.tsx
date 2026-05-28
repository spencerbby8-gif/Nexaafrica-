"use client"

import { useState } from "react"
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
import { Trash2 } from "lucide-react"

/**
 * Account deletion in this phase is human-in-the-loop: we collect the request
 * via a clearly worded confirmation, then open the user's mail client with a
 * pre-filled message to support. This is intentional — destructive actions
 * deserve a real read-receipt and a manual server-side cascade until we have
 * a proper deletion worker. Trust > automation.
 */
export function DeleteAccountDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false)

  const onConfirm = () => {
    const subject = encodeURIComponent("Account deletion request")
    const body = encodeURIComponent(
      `Hi Nexa team,\n\nPlease delete my Nexa account and all associated data (profile, saved jobs, uploaded CV).\n\nAccount email: ${email}\n\nThanks.`,
    )
    window.location.href = `mailto:support@nexa.africa?subject=${subject}&body=${body}`
    setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Request account deletion
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            Permanently delete your Nexa account?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            This removes your profile, saved jobs, and uploaded CV. We&apos;ll
            confirm by email at <span className="text-foreground">{email || "your email"}</span>{" "}
            within 48 hours. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Send deletion request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
