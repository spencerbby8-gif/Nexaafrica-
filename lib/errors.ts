/**
 * Trust-first error mapping.
 *
 * Every user-facing failure runs through here so the UI never shows a raw
 * "TypeError: failed to fetch" or unstyled platform error. The output is a
 * short, calm sentence that tells the user:
 *   - what happened (in human language)
 *   - what to do next
 *
 * Keep messages SHORT. Two short sentences max.
 */

export type ErrorContext =
  | 'cv-upload'
  | 'cv-parse'
  | 'auth'
  | 'save-job'
  | 'profile'
  | 'generic'

type Input =
  | Error
  | { message?: string; status?: number; code?: string }
  | { ok: false; error?: string; status?: number }
  | string
  | null
  | undefined

interface Mapped {
  /** One-line, human, calm. */
  title: string
  /** What to do next. Optional. */
  hint?: string
}

const CONNECTION_HINT =
  'Check your connection and try again. If you are on mobile data, try Wi-Fi.'

/**
 * Detects the cluster of "browser couldn't reach the server" errors. These
 * surface in five different shapes across browsers and runtimes; we treat
 * them as one bucket because the user-facing remedy is identical.
 */
function isNetworkError(raw: string): boolean {
  const s = raw.toLowerCase()
  return (
    s.includes('failed to fetch') ||
    s.includes('networkerror') ||
    s.includes('load failed') ||
    s.includes('network request failed') ||
    s.includes('fetch failed') ||
    s.includes('the internet connection appears to be offline') ||
    s.includes('aborted') ||
    s === 'typeerror'
  )
}

function pickMessage(input: Input): { msg: string; status?: number } {
  if (!input) return { msg: '' }
  if (typeof input === 'string') return { msg: input }
  const status =
    typeof (input as { status?: number }).status === 'number'
      ? (input as { status?: number }).status
      : undefined
  const msg =
    (input as { message?: string }).message ??
    (input as { error?: string }).error ??
    ''
  return { msg, status }
}

export function humanizeError(input: Input, context: ErrorContext = 'generic'): Mapped {
  const { msg, status } = pickMessage(input)

  // Network-class always wins. The user can't do anything about a server-side
  // detail if their browser never reached the server in the first place.
  if (isNetworkError(msg)) {
    return {
      title: 'The connection dropped while we were working.',
      hint: CONNECTION_HINT,
    }
  }

  // Status-based mapping. These cover the common API failures across the app.
  if (status === 401) {
    return {
      title: 'Your session expired.',
      hint: 'Please sign in again to continue.',
    }
  }
  if (status === 403) {
    return {
      title: 'You don\u2019t have access to that.',
      hint: 'If this looks wrong, please sign in again.',
    }
  }
  if (status === 404) {
    return { title: 'We couldn\u2019t find what you were looking for.' }
  }
  if (status === 408) {
    return {
      title: 'That took too long to respond.',
      hint: 'Please try again in a moment.',
    }
  }
  if (status === 413) {
    return {
      title: 'That file is a bit too large.',
      hint: 'Please upload a smaller PDF (under 4MB).',
    }
  }
  if (status === 415) {
    return {
      title: 'That file type isn\u2019t supported.',
      hint: 'Please upload a PDF.',
    }
  }
  if (status === 429) {
    return {
      title: 'You\u2019ve done that a lot in a short time.',
      hint: 'Please wait a moment and try again.',
    }
  }
  if (status === 503) {
    return {
      title: 'A part of Nexa is briefly unavailable.',
      hint: 'Please try again in a minute.',
    }
  }
  if (typeof status === 'number' && status >= 500) {
    return {
      title: 'Something went wrong on our side.',
      hint: 'Please try again. If this keeps happening, take a break and come back shortly.',
    }
  }

  // Context-specific defaults so the copy feels deliberate per surface.
  if (context === 'cv-upload') {
    // Common Android-Chrome scenario: a Drive-preview "PDF" that's actually a
    // 0-byte handle, or a corrupt scan. Both lead to a parse failure on our
    // side, but this copy gets the user to the actual fix.
    if (/empty|0\s*byte|too small|corrupt|invalid/i.test(msg)) {
      return {
        title: 'We couldn\u2019t read this PDF correctly.',
        hint:
          'If you opened the file from cloud storage like Google Drive, try downloading it to your device first, then upload that copy.',
      }
    }
    return {
      title: 'We couldn\u2019t process this CV.',
      hint:
        'Please make sure the file is a real PDF saved on your device, then try again.',
    }
  }

  if (context === 'cv-parse') {
    return {
      title: 'We couldn\u2019t read enough text from this CV.',
      hint:
        'If your CV is a scanned image, export a text-based PDF from Word, Google Docs, or Pages and upload that instead.',
    }
  }

  if (context === 'save-job') {
    return {
      title: 'We couldn\u2019t save that role just now.',
      hint: 'Please try again in a moment.',
    }
  }

  if (context === 'auth') {
    if (/email/i.test(msg) && /invalid|format/i.test(msg)) {
      return { title: 'That email doesn\u2019t look right.', hint: 'Please check it and try again.' }
    }
    if (/rate.?limit|too many/i.test(msg)) {
      return {
        title: 'Too many sign-in attempts in a short time.',
        hint: 'Please wait a minute and try again.',
      }
    }
    return {
      title: 'We couldn\u2019t complete sign-in.',
      hint: 'Please try again. If it keeps failing, request a new sign-in link.',
    }
  }

  if (context === 'profile') {
    return {
      title: 'We couldn\u2019t save those changes.',
      hint: 'Please try again. Your data is still safe.',
    }
  }

  // Generic fallback — never echo a raw stack message.
  return {
    title: 'Something didn\u2019t go through.',
    hint: 'Please try again in a moment.',
  }
}

/** Convenience: render the mapped error as a single user-facing string. */
export function humanizeErrorString(
  input: Input,
  context: ErrorContext = 'generic',
): string {
  const m = humanizeError(input, context)
  return m.hint ? `${m.title} ${m.hint}` : m.title
}
