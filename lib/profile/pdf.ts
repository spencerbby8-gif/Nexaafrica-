import 'server-only'

/**
 * Extract text from a PDF buffer using pdf-parse.
 * Cleans common CV noise: zero-width characters, repeated whitespace,
 * and obvious header/footer page markers.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Lazy import — pdf-parse pulls in fs and is server-only.
  const mod = await import('pdf-parse')
  const pdfParse = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default
  const result = await pdfParse(buffer)
  return cleanText(result.text)
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
