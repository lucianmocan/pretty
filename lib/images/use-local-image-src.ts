import { useEffect, useState } from 'react'
import { parseLocalImageSrc, getImageBlob } from './local-store'

// Cached indefinitely for the tab's lifetime, not revoked -- the working set
// is "however many distinct images are actually on screen this session,"
// small enough that leaking their object URLs until the tab closes is a
// non-issue (unlike the PDF page picker's per-page thumbnails, which DO get
// revoked -- see image-crop-dialog.tsx -- because there can be many of them
// and they're only ever shown once).
const urlCache = new Map<string, string>()
const pendingUrlCache = new Map<string, Promise<string | undefined>>()

/** Resolves a stored `src` -- a `local:{id}` reference into this browser's
 * IndexedDB (see local-store.ts) -- into an actual `blob:` URL usable in an
 * `<img>`/`<image>` tag. A non-local `src` (e.g. an already-resolved blob:
 * URL, or a legacy value from before this scheme existed) passes through
 * unchanged. */
export function useLocalImageSrc(src: string | undefined | null): string | undefined {
  // Anything already resolvable without touching IndexedDB -- a non-local
  // src, or a local one already sitting in urlCache -- is derived directly
  // during render, no state/effect needed for that path at all.
  const syncValue = resolveSync(src)
  const [asyncResolution, setAsyncResolution] = useState<{
    src: string
    url: string
  } | null>(null)

  useEffect(() => {
    if (syncValue !== undefined || !src) return
    const id = parseLocalImageSrc(src)
    if (!id) return
    let cancelled = false
    resolveLocalImageUrl(src, id).then((url) => {
      if (!cancelled && url) setAsyncResolution({ src, url })
    })
    return () => {
      cancelled = true
    }
  }, [src, syncValue])

  return syncValue ?? (
    asyncResolution && asyncResolution.src === src ? asyncResolution.url : undefined
  )
}

/** Keep IndexedDB resolution shared across component lifecycles. A remount or
 * rapid page swap can then resolve from the synchronous URL cache instead of
 * starting—and potentially cancelling—the same media read again. */
function resolveLocalImageUrl(src: string, id: string): Promise<string | undefined> {
  const cached = urlCache.get(src)
  if (cached) return Promise.resolve(cached)
  const existing = pendingUrlCache.get(src)
  if (existing) return existing

  const pending = getImageBlob(id)
    .then((blob) => {
      if (!blob) return undefined
      const cachedAfterRead = urlCache.get(src)
      if (cachedAfterRead) return cachedAfterRead
      const url = URL.createObjectURL(blob)
      urlCache.set(src, url)
      return url
    })
    .catch(() => undefined)
  pendingUrlCache.set(src, pending)
  void pending.then(() => {
    if (pendingUrlCache.get(src) === pending) pendingUrlCache.delete(src)
  })
  return pending
}

function resolveSync(src: string | undefined | null): string | undefined {
  if (!src) return undefined
  if (!parseLocalImageSrc(src)) return src
  return urlCache.get(src)
}
