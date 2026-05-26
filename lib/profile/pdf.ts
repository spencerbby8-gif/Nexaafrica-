import "server-only"

/**
 * Extract text from a PDF buffer using `unpdf` — pure-JS, serverless-friendly.
 *
 * Both the import and the work are wrapped in a timeout so the API route
 * can never hang past Vercel's `maxDuration`. If extraction is slow or fails,
 * we always throw a JSON-friendly Error instead of letting the connection die.
 */
export async function extractPdfText(buffer: Buffer, timeoutMs = 25_000): Promise<string> {
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  const work = (async () => {
    // Lazy import so a build/bundling problem with unpdf can't crash the
    // serverless function at module init.
    const { extractText } = await import("unpdf")
    const result = await extractText(data, { mergePages: true })
    const text = Array.isArray(result.text) ? result.text.join("\n") : (result.text ?? "")
    return cleanText(text)
  })()

  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`PDF extraction timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function cleanText(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
