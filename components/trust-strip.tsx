import { ShieldCheck, Globe2, Coins, EyeOff } from 'lucide-react'

const SIGNALS = [
  { icon: ShieldCheck, label: 'Reviewed listings' },
  { icon: Globe2, label: 'Open to Africa' },
  { icon: Coins, label: 'No fees to apply' },
  { icon: EyeOff, label: 'No recruiter spam' },
]

export function TrustStrip() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
      aria-label="Platform trust signals"
    >
      {SIGNALS.map((s) => {
        const Icon = s.icon
        return (
          <li key={s.label} className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-foreground/60" aria-hidden />
            <span>{s.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
