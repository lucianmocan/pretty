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
