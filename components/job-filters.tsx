'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { Category } from '@/lib/types'

const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]

export function JobFilters({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  const current = {
    category: searchParams.get('category') ?? '',
    employment_type: searchParams.get('employment_type') ?? '',
    remote: searchParams.get('remote') === '1',
    africa: searchParams.get('africa') === '1',
  }

  const activeCount =
    (current.category ? 1 : 0) +
    (current.employment_type ? 1 : 0) +
    (current.remote ? 1 : 0) +
    (current.africa ? 1 : 0)

  const apply = useCallback(
    (next: Partial<typeof current>) => {
      const params = new URLSearchParams(searchParams.toString())
      const merged = { ...current, ...next }

      if (merged.category) params.set('category', merged.category)
      else params.delete('category')

      if (merged.employment_type) params.set('employment_type', merged.employment_type)
      else params.delete('employment_type')

      if (merged.remote) params.set('remote', '1')
      else params.delete('remote')

      if (merged.africa) params.set('africa', '1')
      else params.delete('africa')

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [current, pathname, router, searchParams],
  )

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('category')
    params.delete('employment_type')
    params.delete('remote')
    params.delete('africa')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filter roles</SheetTitle>
          <SheetDescription>Narrow listings by category, type, and region.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 py-2">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            <select
              value={current.category}
              onChange={(e) => apply({ category: e.target.value })}
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-foreground/30"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Employment type
            </label>
            <select
              value={current.employment_type}
              onChange={(e) => apply({ employment_type: e.target.value })}
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-foreground/30"
            >
              {EMPLOYMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
              <span className="text-sm">Remote only</span>
              <input
                type="checkbox"
                checked={current.remote}
                onChange={(e) => apply({ remote: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
              <span className="text-sm">Open to Africa</span>
              <input
                type="checkbox"
                checked={current.africa}
                onChange={(e) => apply({ africa: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
          </div>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={clear}>
            Clear
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
