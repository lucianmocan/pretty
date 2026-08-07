'use client'

import type { RefObject } from 'react'

const CACHE_PREFIX = 'scripture:document-preview:'
const MAX_CONCURRENT_PREVIEWS = 2

interface PendingSlot {
  key: string
  resolve: (release: () => void) => void
  reject: (error: Error) => void
  signal: AbortSignal
  onAbort: () => void
}

let activePreviewSlots = 0
const activePreviewKeys = new Set<string>()
const pendingPreviewSlots: PendingSlot[] = []

function releasePreviewSlot(key: string) {
  activePreviewSlots = Math.max(0, activePreviewSlots - 1)
  activePreviewKeys.delete(key)
  while (pendingPreviewSlots.length > 0 && activePreviewSlots < MAX_CONCURRENT_PREVIEWS) {
    const index = pendingPreviewSlots.findIndex(
      (candidate) => !candidate.signal.aborted && !activePreviewKeys.has(candidate.key)
    )
    if (index < 0) break
    const [pending] = pendingPreviewSlots.splice(index, 1)
    pending.signal.removeEventListener('abort', pending.onAbort)
    activePreviewSlots += 1
    activePreviewKeys.add(pending.key)
    let released = false
    pending.resolve(() => {
      if (released) return
      released = true
      releasePreviewSlot(pending.key)
    })
  }
}

/** Limits expensive preview preparation and serializes work for one page. */
export function acquirePreviewSlot(key: string, signal: AbortSignal): Promise<() => void> {
  if (signal.aborted) return Promise.reject(new DOMException('Preview cancelled', 'AbortError'))
  if (activePreviewSlots < MAX_CONCURRENT_PREVIEWS && !activePreviewKeys.has(key)) {
    activePreviewSlots += 1
    activePreviewKeys.add(key)
    let released = false
    return Promise.resolve(() => {
      if (released) return
      released = true
      releasePreviewSlot(key)
    })
  }

  return new Promise((resolve, reject) => {
    const pending = {} as PendingSlot
    pending.key = key
    pending.resolve = resolve
    pending.reject = reject
    pending.signal = signal
    pending.onAbort = () => {
      const index = pendingPreviewSlots.indexOf(pending)
      if (index >= 0) pendingPreviewSlots.splice(index, 1)
      reject(new DOMException('Preview cancelled', 'AbortError'))
    }
    signal.addEventListener('abort', pending.onAbort, { once: true })
    pendingPreviewSlots.push(pending)
  })
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export async function waitForPagePreviewSurface(
  rootRef: RefObject<HTMLElement | null>,
  pageId: string,
  signal?: AbortSignal
): Promise<HTMLElement> {
  const deadline = performance.now() + 15_000
  while (performance.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Preview cancelled', 'AbortError')
    const page = rootRef.current?.querySelector<HTMLElement>(
      `.scripture-browser-export-page[data-export-page-id="${CSS.escape(pageId)}"]`
    )
    if (page?.dataset.exportError) throw new Error(`Could not prepare preview: ${page.dataset.exportError}`)
    if (page?.dataset.exportReady === 'true') {
      await document.fonts.ready
      await nextPaint()
      return page
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  throw new Error('Timed out while preparing the page preview.')
}

/** Removes bitmap previews created by older app versions. */
export function clearDocumentPreview(docId: string) {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${docId}`)
  } catch {
    // Best effort; document deletion must not fail over a legacy cache entry.
  }
}
