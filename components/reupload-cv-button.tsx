"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
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
 * Re-upload entry point. Confirms before navigating to /onboarding?reupload=1
 * so users don't accidentally overwrite their generated profile.
 */
export function ReuploadCvButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const onConfirm = () => {
    setOpen(false)
    router.push("/onboarding?reupload=1")
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Re-upload CV
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Replace your current profile?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Uploading a new CV will replace your generated profile, including any edits
            you&apos;ve made. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep current profile</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue to upload</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
