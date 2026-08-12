import { toLocalImageSrc, parseLocalImageSrc, putImageBlob, getImageBlob, deleteImageBlob } from './local-store'

/** Shared PDF-vs-image file detection -- used both by the image block's own
 * file input/drop zone and by canvas-wide file drops, so a dropped PDF
 * always routes to the page-picker dialog instead of being uploaded as-is. */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/** Client-side counterpart to lib/images/local-store.ts -- deletes an
 * uploaded image via its stored `local:{id}` reference. Images live only in
 * this browser's IndexedDB; nothing here ever touches a server. */
export async function deleteUploadedImage(src: string | undefined | null): Promise<void> {
  const id = parseLocalImageSrc(src)
  if (!id) return
  await deleteImageBlob(id)
}

/** Shared "store this file" path for anything that ends up as an image
 * block's `src` -- a plain file picker pick, a canvas file drop, a PDF page
 * converted to SVG client-side, or a background-removal result. Every
 * caller gets back a `local:{id}` reference into this browser's IndexedDB,
 * never a data URI (keeps the collaborative doc small) and never a network
 * upload (images never leave the browser). `filename` is accepted for
 * caller-compatibility but unused -- there's no server-side extension to
 * derive it for anymore. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for caller compatibility, see doc comment above
export async function uploadImageFile(file: File | Blob, _filename?: string): Promise<string> {
  const id = crypto.randomUUID()
  await putImageBlob(id, file)
  return toLocalImageSrc(id)
}

/** Creates a separately-owned copy of an uploaded image. Pages must not
 * share the same stored id: deleting either page also deletes its image
 * resources, which would otherwise leave the remaining page broken. */
export async function duplicateUploadedImage(src: string): Promise<string> {
  const id = parseLocalImageSrc(src)
  if (!id) throw new Error('Cannot duplicate an image that has no local reference.')
  const blob = await getImageBlob(id)
  if (!blob) throw new Error('The original image could not be found in local storage while duplicating the page.')
  return uploadImageFile(blob)
}
