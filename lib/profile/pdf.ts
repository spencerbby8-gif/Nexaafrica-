import "server-only"

/**
 * Extract text from a PDF buffer using `unpdf` — a pure-JS, serverless-friendly
 * wrapper around pdf.js. Works on Vercel Node runtime with no native deps,
 * no worker setup, and no font files required.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Lazy import keeps the module out of the cold-start path for non-CV routes.
  const { extractText } = await import("unpdf")

  // unpdf accepts a Uint8Array. Buffer is one, but we pass an explicit view
  // so we don't accidentally hand over a shared underlying ArrayBuffer.
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  const result = await extractText(data, { mergePages: true })
  const text = Array.isArray(result.text) ? result.text.join("\n") : (result.text ?? "")
  return cleanText(text)
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
