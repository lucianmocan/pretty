import { writeImageBytes } from '@/lib/images/store'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB -- generous for a screenshot/diagram, not a video

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return new Response('Missing file', { status: 400 })
  if (file.size > MAX_BYTES) return new Response('File too large', { status: 413 })

  const id = crypto.randomUUID()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const bytes = Buffer.from(await file.arrayBuffer())
  await writeImageBytes(id, ext, bytes)

  return Response.json({ id, url: `/api/images/${id}` })
}
