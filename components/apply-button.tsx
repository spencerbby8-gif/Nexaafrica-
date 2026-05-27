"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ShieldCheck, FileText, ArrowUpRight, ArrowRightFromLine } from "lucide-react"

type Props = {
  applyUrl: string
  jobSlug: string
  /**
   * "authed-incomplete" → user signed in, no profile yet → show gate, send to onboarding
   * "authed-complete" → user signed in with profile → external apply
   * "anon" → not signed in → show gate, send to sign-in
   */
  state: "anon" | "authed-incomplete" | "authed-complete"
  className?: string
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
  fullWidth?: boolean
  children?: React.ReactNode
}

export function ApplyButton({
  applyUrl,
  jobSlug,
  state,
  className,
  variant = "default",
  size = "default",
  fullWidth,
  children,
}: Props) {
  const [open, setOpen] = useState(false)

  // Authed + complete: direct external link.
  if (state === "authed-complete") {
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <a href={applyUrl} target="_blank" rel="noopener noreferrer nofollow">
          {children ?? "Apply on company site"}
          <ArrowUpRight className="ml-1 h-4 w-4" />
        </a>
      </Button>
    )
  }

  const next =
    state === "anon"
      ? `/sign-in?next=${encodeURIComponent(`/role/${jobSlug}?apply=1`)}`
      : `/onboarding?next=${encodeURIComponent(`/role/${jobSlug}?apply=1`)}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          style={fullWidth ? { width: "100%" } : undefined}
        >
          {children ?? "Apply now"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <DialogTitle className="text-lg">One short step before applying</DialogTitle>
          <DialogDescription className="text-pretty leading-relaxed">
            Global employers prefer structured profiles. Upload your CV and Nexa will format it for
            remote applications. You can edit anything before submitting.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
            <span>Your CV stays private. Only you can view it.</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
            <span>No payment is ever required to apply through Nexa.</span>
          </li>
          <li className="flex items-start gap-2">
            <ArrowRightFromLine className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
            <span>You apply directly on the company&rsquo;s site. Nexa never handles applications.</span>
          </li>
        </ul>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
          <Button asChild className="w-full sm:w-auto">
            <Link href={next}>{state === "anon" ? "Continue with email or Google" : "Upload CV"}</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="w-full text-muted-foreground sm:w-auto"
            onClick={() => setOpen(false)}
          >
            <span>Maybe later</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
