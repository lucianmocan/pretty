import { writeDocumentBytes, readDocumentBytes, deleteDocumentBytes } from '@/lib/documents/store'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data } = (await request.json()) as { data: string }
  const bytes = Buffer.from(data, 'base64')
  await writeDocumentBytes(id, bytes)
  return Response.json({ ok: true })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bytes = await readDocumentBytes(id)
  if (!bytes) return new Response('Not found', { status: 404 })
  return Response.json({ data: Buffer.from(bytes).toString('base64') })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteDocumentBytes(id)
  return Response.json({ ok: true })
}
