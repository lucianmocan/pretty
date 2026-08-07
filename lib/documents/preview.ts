'use client'

import type { RefObject } from 'react'
import type { PageNumberSettings } from '@/lib/documents/manifest'

const CACHE_PREFIX = 'scripture:document-preview:'
const MAX_CONCURRENT_PREVIEWS = 2
const PREVIEW_DATABASE = 'scripture-preview-cache'
const PREVIEW_STORE = 'page-previews'
const PREVIEW_DATABASE_VERSION = 1
// Bump when preview markup or its core styling changes incompatibly. Cached
// HTML deliberately uses the current app stylesheet, so compatible visual
// tweaks do not require rewriting every saved page.
const PREVIEW_RENDERER_VERSION = 1
const MAX_SNAPSHOT_CHARACTERS = 1_500_000
const MAX_SAVED_PREVIEWS = 32

export interface PagePreviewSnapshot {
  pageId: string
  variant: string
  html: string
  pageWidth: number
  pageHeight: number
}

interface StoredPagePreview extends PagePreviewSnapshot {
  rendererVersion: number
  savedAt: number
}

let previewDatabasePromise: Promise<IDBDatabase | null> | null = null

function openPreviewDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (previewDatabasePromise) return previewDatabasePromise

  previewDatabasePromise = new Promise((resolve) => {
    let abandoned = false
    const request = indexedDB.open(PREVIEW_DATABASE, PREVIEW_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(PREVIEW_STORE)
        ? request.transaction?.objectStore(PREVIEW_STORE)
        : database.createObjectStore(PREVIEW_STORE, { keyPath: 'pageId' })
      if (store && !store.indexNames.contains('savedAt')) store.createIndex('savedAt', 'savedAt')
    }
    request.onsuccess = () => {
      const database = request.result
      if (abandoned) {
        database.close()
        return
      }
      database.onversionchange = () => {
        database.close()
        previewDatabasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => resolve(null)
    request.onblocked = () => {
      abandoned = true
      resolve(null)
    }
  })
  return previewDatabasePromise
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function trimPreviewCache(database: IDBDatabase): Promise<void> {
  const countTransaction = database.transaction(PREVIEW_STORE, 'readonly')
  const countRequest = countTransaction.objectStore(PREVIEW_STORE).count()
  const count = await new Promise<number>((resolve, reject) => {
    countRequest.onsuccess = () => resolve(countRequest.result)
    countRequest.onerror = () => reject(countRequest.error)
  })
  let remaining = Math.max(0, count - MAX_SAVED_PREVIEWS)
  if (remaining <= 0) return

  // Start a fresh transaction after the asynchronous count. IndexedDB may
  // auto-close a transaction across an await when it has no pending request.
  const trimTransaction = database.transaction(PREVIEW_STORE, 'readwrite')
  const trimComplete = transactionComplete(trimTransaction)
  const store = trimTransaction.objectStore(PREVIEW_STORE)
  const cursorRequest = store.index('savedAt').openKeyCursor()
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor || remaining <= 0) {
        resolve()
        return
      }
      store.delete(cursor.primaryKey)
      remaining -= 1
      cursor.continue()
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
  await trimComplete
}

export function pagePreviewVariant(
  pageNumber?: number,
  pageNumberSettings?: PageNumberSettings
): string {
  if (pageNumber == null || !pageNumberSettings) return 'no-page-number'
  const typography = pageNumberSettings.typography
  return JSON.stringify([
    pageNumber,
    pageNumberSettings.vertical,
    pageNumberSettings.horizontal,
    pageNumberSettings.numeralStyle,
    typography.fontFamily,
    typography.fontSource,
    typography.fontWeight,
    typography.fontStyle,
    typography.fontSize,
    typography.lineHeight,
    typography.letterSpacing,
    typography.textColor,
    typography.highlightColor,
    typography.underline,
    typography.strike,
  ])
}

export async function readPagePreview(pageId: string, variant: string): Promise<PagePreviewSnapshot | null> {
  try {
    const database = await openPreviewDatabase()
    if (!database) return null
    const transaction = database.transaction(PREVIEW_STORE, 'readonly')
    const request = transaction.objectStore(PREVIEW_STORE).get(pageId)
    const snapshot = await new Promise<StoredPagePreview | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredPagePreview | undefined)
      request.onerror = () => reject(request.error)
    })
    if (
      !snapshot ||
      snapshot.rendererVersion !== PREVIEW_RENDERER_VERSION ||
      snapshot.variant !== variant ||
      !snapshot.html.includes('id="canvas-root"') ||
      snapshot.pageWidth <= 0 ||
      snapshot.pageHeight <= 0
    ) {
      return null
    }
    return snapshot
  } catch {
    // Preview persistence is an optimization; storage failures must never
    // prevent the authoritative Yjs document from rendering normally.
    return null
  }
}

export async function savePagePreview(
  snapshot: PagePreviewSnapshot
): Promise<void> {
  try {
    const database = await openPreviewDatabase()
    if (!database) return
    if (snapshot.html.length > MAX_SNAPSHOT_CHARACTERS) {
      await clearPagePreview(snapshot.pageId)
      return
    }
    const transaction = database.transaction(PREVIEW_STORE, 'readwrite')
    transaction.objectStore(PREVIEW_STORE).put({
      ...snapshot,
      rendererVersion: PREVIEW_RENDERER_VERSION,
      savedAt: Date.now(),
    } satisfies StoredPagePreview)
    await transactionComplete(transaction)
    await trimPreviewCache(database)
  } catch {
    // Best effort: the live vector preview remains the fallback.
  }
}

export async function clearPagePreview(pageId: string): Promise<void> {
  try {
    const database = await openPreviewDatabase()
    if (!database) return
    const transaction = database.transaction(PREVIEW_STORE, 'readwrite')
    transaction.objectStore(PREVIEW_STORE).delete(pageId)
    await transactionComplete(transaction)
  } catch {
    // Best effort; deleting content must not depend on its disposable cache.
  }
}

/** One-way cleanup for data-URL thumbnails created before vector previews. */
export function clearLegacyDocumentPreview(docId: string): void {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${docId}`)
  } catch {
    // Legacy cleanup is best effort.
  }
}

interface PendingSlot {
  key: string
  resolve: (release: () => void) => void
  reject: (error: Error) => void
  signal: AbortSignal
  onAbort: () => void
  priority: 'foreground' | 'background'
}

let activePreviewSlots = 0
const activePreviewKeys = new Set<string>()
const pendingPreviewSlots: PendingSlot[] = []

function releasePreviewSlot(key: string) {
  activePreviewSlots = Math.max(0, activePreviewSlots - 1)
  activePreviewKeys.delete(key)
  while (pendingPreviewSlots.length > 0) {
    const canStart = (candidate: PendingSlot) =>
      !candidate.signal.aborted &&
      !activePreviewKeys.has(candidate.key) &&
      activePreviewSlots < MAX_CONCURRENT_PREVIEWS + (candidate.priority === 'foreground' ? 1 : 0)
    const foregroundIndex = pendingPreviewSlots.findIndex(
      (candidate) => candidate.priority === 'foreground' && canStart(candidate)
    )
    const index = foregroundIndex >= 0 ? foregroundIndex : pendingPreviewSlots.findIndex(canStart)
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

/** Limits expensive preview preparation and serializes work for one page.
 * Foreground refreshes get one reserved burst slot and jump queued background
 * work, so the slide currently being edited never waits behind thumbnails. */
export function acquirePreviewSlot(
  key: string,
  signal: AbortSignal,
  priority: 'foreground' | 'background' = 'background'
): Promise<() => void> {
  if (signal.aborted) return Promise.reject(new DOMException('Preview cancelled', 'AbortError'))
  const capacity = MAX_CONCURRENT_PREVIEWS + (priority === 'foreground' ? 1 : 0)
  if (activePreviewSlots < capacity && !activePreviewKeys.has(key)) {
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
    pending.priority = priority
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

/** Removes current page snapshots plus bitmap previews from older versions. */
export async function clearDocumentPreview(docId: string, pageIds: string[] = [docId]): Promise<void> {
  clearLegacyDocumentPreview(docId)
  await Promise.all(pageIds.map(clearPagePreview))
}
