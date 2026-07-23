/** Client-side counterpart to lib/images/store.ts -- best-effort deletion of
 * an uploaded image via its stored src URL (always `/api/images/{id}`, see
 * app/api/images/route.ts). Nothing in the app called this anywhere before,
 * so every uploaded image accumulated permanently in .data/images/. */
export function deleteUploadedImage(src: string | undefined | null): void {
  if (!src) return
  const id = src.split('/').pop()
  if (!id) return
  fetch(`/api/images/${id}`, { method: 'DELETE' }).catch(() => {})
}
