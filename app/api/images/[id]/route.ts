import { readImageBytes, deleteImageBytes } from '@/lib/images/store'

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await readImageBytes(id)
  if (!result) return new Response('Not found', { status: 404 })
  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[result.ext] ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  // An SVG with an embedded <script> executes if this URL is opened
  // directly (not via <img>, which never runs scripts regardless) -- this
  // has no effect on normal <img>-embedded rendering (an <img> load never
  // executes scripts in the first place), only on direct navigation.
  if (result.ext === 'svg') headers['Content-Security-Policy'] = "script-src 'none'"
  return new Response(new Uint8Array(result.bytes), { headers })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteImageBytes(id)
  return Response.json({ ok: true })
}
