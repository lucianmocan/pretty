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
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      'Content-Type': CONTENT_TYPES[result.ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteImageBytes(id)
  return Response.json({ ok: true })
}
