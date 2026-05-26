import 'server-only'

/**
 * Extract text from a PDF buffer using pdf-parse v2.
 * v2 exposes a PDFParse class (no default callable like v1).
 *
 * Cleans common CV noise: zero-width characters, repeated whitespace,
 * and obvious header/footer page markers.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Lazy import — pdf-parse pulls in pdfjs-dist and is server-only.
  const { PDFParse } = await import('pdf-parse')
  // pdf-parse expects a Uint8Array-like input. Buffer is a Uint8Array, but we
  // pass a fresh Uint8Array view to avoid any subarray surprises.
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const parser = new PDFParse({ data })
  try {
    const result = await parser.getText()
    return cleanText(result.text ?? '')
  } finally {
    // Always release pdfjs-dist worker resources.
    try {
      await parser.destroy()
    } catch {
      // Ignore destroy errors.
    }
  }
}

export function cleanText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
