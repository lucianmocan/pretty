export const PAGE_CANVAS_CACHE_LIMIT = 3

/** Keeps the active page at the MRU end of a bounded list. React keys then
 * preserve the DOM/state for recently visited canvases while the oldest one
 * is evicted before the editor's hidden DOM can grow without bound. */
export function retainPageCanvas(
  cachedPageIds: readonly string[],
  pageId: string,
  limit = PAGE_CANVAS_CACHE_LIMIT
): string[] {
  if (limit <= 0) return []
  const next = cachedPageIds.filter((candidate) => candidate !== pageId)
  next.push(pageId)
  return next.slice(-limit)
}

export function removePageCanvas(cachedPageIds: readonly string[], pageId: string): string[] {
  return cachedPageIds.filter((candidate) => candidate !== pageId)
}
