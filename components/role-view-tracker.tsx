'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

type Props = {
  jobId: string
  slug: string
  company: string
  openToAfrica: boolean
}

/**
 * Fires a single `role_view` analytics event on mount. Lives as its own
 * component so the parent role page can stay an RSC.
 */
export function RoleViewTracker({ jobId, slug, company, openToAfrica }: Props) {
  useEffect(() => {
    track({
      name: 'role_view',
      props: { jobId, slug, company, openToAfrica },
    })
    // Intentionally only on mount — re-renders shouldn't double-count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
