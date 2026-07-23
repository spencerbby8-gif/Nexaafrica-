"use client"

import { useState } from "react"
import { Flag, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = { jobId: string; jobSlug: string }

export function ReportButton({ jobId, jobSlug }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("scam")
  const [details, setDetails] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")

  const submit = async () => {
    setStatus("sending")
    try {
      const res = await fetch("/api/jobs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, reason, details }),
      })
      if (!res.ok) throw new Error("failed")
      setStatus("sent")
      setTimeout(() => {
        setOpen(false)
        setStatus("idle")
        setDetails("")
      }, 1500)
    } catch {
      setStatus("error")
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300"
      >
        <Flag className="h-3.5 w-3.5" /> Report suspicious
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <p className="text-[13px] font-medium">Report this job</p>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px]">
        <option value="scam">Scam / pay to apply</option>
        <option value="fake">Fake / not hiring</option>
        <option value="expired">Expired</option>
        <option value="wrong_location">Wrong location</option>
        <option value="discriminatory">Discriminatory</option>
        <option value="spam">Spam</option>
        <option value="other">Other</option>
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Details (optional)"
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] min-h-[60px]"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={status === "sending"} className="bg-white text-black hover:bg-zinc-200">
          {status === "sending" ? "Sending..." : status === "sent" ? "Sent ✓" : <><Send className="mr-1.5 h-3 w-3" /> Submit</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {status === "error" && <p className="text-[11px] text-red-400">Failed to send report.</p>}
    </div>
  )
}
