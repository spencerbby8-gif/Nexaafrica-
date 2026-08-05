export async function GET() {
  return new Response('ok e-plain-response', { headers: { 'Content-Type': 'text/plain' } })
}
