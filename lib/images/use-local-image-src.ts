import { useEffect, useState } from 'react'
import { parseLocalImageSrc, getImageBlob } from './local-store'

// Cached indefinitely for the tab's lifetime, not revoked -- the working set
// is "however many distinct images are actually on screen this session,"
// small enough that leaking their object URLs until the tab closes is a
// non-issue (unlike the PDF page picker's per-page thumbnails, which DO get
// revoked -- see image-crop-dialog.tsx -- because there can be many of them
// and they're only ever shown once).
const urlCache = new Map<string, string>()

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
  const [asyncValue, setAsyncValue] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (syncValue !== undefined || !src) return
    const id = parseLocalImageSrc(src)
    if (!id) return
    let cancelled = false
    getImageBlob(id).then((blob) => {
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      urlCache.set(src, url)
      setAsyncValue(url)
    })
    return () => {
      cancelled = true
    }
  }, [src, syncValue])

  return syncValue ?? asyncValue
}

function resolveSync(src: string | undefined | null): string | undefined {
  if (!src) return undefined
  if (!parseLocalImageSrc(src)) return src
  return urlCache.get(src)
}
