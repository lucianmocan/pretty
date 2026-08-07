/** Client-side counterpart to lib/images/store.ts -- best-effort deletion of
 * an uploaded image via its stored src URL (always `/api/images/{id}`, see
 * app/api/images/route.ts). Nothing in the app called this anywhere before,
 * so every uploaded image accumulated permanently in .data/images/. */
export async function deleteUploadedImage(src: string | undefined | null): Promise<void> {
  if (!src) return
  const id = src.split('/').pop()
  if (!id) return
  const response = await fetch(`/api/images/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Could not remove uploaded image (${response.status})`)
}

const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** Creates a separately-owned copy of an uploaded image. Pages must not
 * share the same stored URL: deleting either page also deletes its image
 * resources, which would otherwise leave the remaining page broken. */
export async function duplicateUploadedImage(src: string): Promise<string> {
  const sourceResponse = await fetch(src)
  if (!sourceResponse.ok) throw new Error(`Could not read an image while duplicating the page (${sourceResponse.status})`)

  const blob = await sourceResponse.blob()
  const extension = IMAGE_EXTENSION_BY_TYPE[blob.type] ?? 'png'
  const formData = new FormData()
  formData.append('file', blob, `duplicate.${extension}`)

  const uploadResponse = await fetch('/api/images', { method: 'POST', body: formData })
  if (!uploadResponse.ok) throw new Error(`Could not copy an image while duplicating the page (${uploadResponse.status})`)
  const result = (await uploadResponse.json()) as { url?: unknown }
  if (typeof result.url !== 'string') throw new Error('The duplicated image did not return a valid URL.')
  return result.url
}
