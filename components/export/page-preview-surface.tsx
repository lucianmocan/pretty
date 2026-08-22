'use client'

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BrowserExportPage } from '@/components/export/browser-export-surfaces'
import {
  acquirePreviewSlot,
  pagePreviewVariant,
  readPagePreview,
  savePagePreview,
  waitForPagePreviewSurface,
  type PagePreviewSnapshot,
} from '@/lib/documents/preview'
import type { PageNumberSettings } from '@/lib/documents/manifest'

interface PagePreviewSurfaceProps {
  pageId: string
  revision?: number
  pageNumber?: number
  pageNumberSettings?: PageNumberSettings
  priority?: 'foreground' | 'background'
}

/**
 * A vector-like preview: this is the real export DOM, fitted into a small
 * viewport with a CSS transform. Nothing is rasterized, so text, icons,
 * borders, and CSS shapes stay sharp at every browser/device scale.
 *
 * Previews lazy-mount the first time they approach the viewport, then remain
 * mounted. This keeps scrolling and reordering from rebuilding an already
 * prepared document tree. Initial preparation is globally limited by
 * acquirePreviewSlot(), preventing a large page list from tokenizing and
 * laying out every page simultaneously. Once ready, the rendered DOM is
 * persisted in IndexedDB; a later session can paint that sharp snapshot
 * immediately while the authoritative Yjs-backed version revalidates it.
 */
export const PagePreviewSurface = memo(function PagePreviewSurface({
  pageId,
  revision = 0,
  pageNumber,
  pageNumberSettings,
  priority = 'background',
}: PagePreviewSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<HTMLDivElement>(null)
  const cachedDocumentRef = useRef<HTMLDivElement>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const requestRef = useRef(0)
  const cacheRequestRef = useRef(0)
  const lastSavedHtmlRef = useRef<string | null>(null)
  const [shouldMount, setShouldMount] = useState(
    () => typeof IntersectionObserver === 'undefined'
  )
  const [mountedState, setMountedState] = useState<{
    key: string
    priority: 'foreground' | 'background'
  } | null>(null)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [cachedScale, setCachedScale] = useState(1)
  const variant = pagePreviewVariant(pageNumber, pageNumberSettings)
  const previewKey = `${pageId}\u0000${variant}`
  const slotKey = `${pageId}\u0000${priority}`
  const [cachedState, setCachedState] = useState<{
    key: string
    snapshot: PagePreviewSnapshot
  } | null>(null)
  const cachedSnapshot = cachedState?.key === previewKey ? cachedState.snapshot : null
  const mounted = shouldMount && mountedState?.key === slotKey
  const acquiredPriority = mountedState?.key === slotKey ? mountedState.priority : 'background'
  const ready = readyKey === previewKey
  const failed = failedKey === previewKey
  const resolvedPageNumber = useMemo(
    () => pageNumber != null && pageNumberSettings
      ? { number: pageNumber, settings: pageNumberSettings }
      : undefined,
    [pageNumber, pageNumberSettings]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof IntersectionObserver === 'undefined') return
    const scrollingRoot = viewport.closest('.scripture-pages-scroll')
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldMount(true)
        observer.disconnect()
      },
      {
        root: scrollingRoot,
        rootMargin: scrollingRoot ? '120px 0px' : '200px 0px',
      }
    )
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldMount) return
    const request = cacheRequestRef.current + 1
    cacheRequestRef.current = request
    lastSavedHtmlRef.current = null
    void readPagePreview(pageId, variant).then((snapshot) => {
      if (cacheRequestRef.current !== request || !snapshot) return
      const viewport = viewportRef.current
      if (viewport) {
        setCachedScale(Math.min(
          viewport.clientWidth / snapshot.pageWidth,
          viewport.clientHeight / snapshot.pageHeight
        ))
      }
      lastSavedHtmlRef.current = snapshot.html
      setCachedState({ key: previewKey, snapshot })
    })
    return () => {
      if (cacheRequestRef.current === request) cacheRequestRef.current += 1
    }
  }, [pageId, previewKey, shouldMount, variant])

  useEffect(() => {
    if (!cachedSnapshot) return
    const viewport = viewportRef.current
    const cachedDocument = cachedDocumentRef.current
    if (!viewport) return
    if (cachedDocument) cachedDocument.inert = true
    const updateScale = () => {
      setCachedScale(Math.min(
        viewport.clientWidth / cachedSnapshot.pageWidth,
        viewport.clientHeight / cachedSnapshot.pageHeight
      ))
    }
    const observer = new ResizeObserver(updateScale)
    observer.observe(viewport)
    updateScale()
    return () => observer.disconnect()
  }, [cachedSnapshot])

  useEffect(() => {
    if (!shouldMount) return

    const request = requestRef.current + 1
    requestRef.current = request
    const controller = new AbortController()
    const requestPriority = priority
    void acquirePreviewSlot(pageId, controller.signal, requestPriority)
      .then((release) => {
        if (controller.signal.aborted || requestRef.current !== request) {
          release()
          return
        }
        releaseRef.current = release
        setFailedKey((current) => current === previewKey ? null : current)
        setMountedState({ key: slotKey, priority: requestPriority })
      })
      .catch((error) => {
        if (!controller.signal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
          setFailedKey(previewKey)
        }
      })

    return () => {
      controller.abort()
      releaseRef.current?.()
      releaseRef.current = null
      setMountedState((current) => current?.key === slotKey ? null : current)
    }
  }, [pageId, previewKey, priority, shouldMount, slotKey])

  useEffect(() => {
    if (!mounted) return
    const controller = new AbortController()
    let geometryObserver: ResizeObserver | null = null
    let readinessObserver: MutationObserver | null = null
    let measurementVersion = 0
    if (documentRef.current) documentRef.current.inert = true

    void waitForPagePreviewSurface(documentRef, pageId, controller.signal)
      .then((surface) => {
        if (controller.signal.aborted) return
        const documentHost = documentRef.current
        if (!documentHost) throw new Error('The preview page did not render.')

        // The exported copy can contain controls used to visualize collapsed
        // ranges. It is purely decorative here and must never enter the tab
        // order or respond to pointer input.
        documentHost.inert = true

        const measureCurrentPage = () => {
          const version = measurementVersion + 1
          measurementVersion = version
          if (surface.dataset.exportReady !== 'true') {
            geometryObserver?.disconnect()
            geometryObserver = null
            setReadyKey((current) => current === previewKey ? null : current)
            return
          }

          void document.fonts.ready.then(() => {
            requestAnimationFrame(() => {
              if (controller.signal.aborted || version !== measurementVersion) return
              const viewport = viewportRef.current
              const page = surface.querySelector<HTMLElement>('.scripture-card')
              if (!viewport || !page) return
              const pageWidth = page.offsetWidth
              const pageHeight = page.offsetHeight
              if (pageWidth <= 0 || pageHeight <= 0) return
              const updateScale = () => {
                setScale(Math.min(viewport.clientWidth / pageWidth, viewport.clientHeight / pageHeight))
              }
              geometryObserver?.disconnect()
              geometryObserver = new ResizeObserver(updateScale)
              geometryObserver.observe(viewport)
              geometryObserver.observe(page)
              updateScale()
              const canvasRoot = surface.querySelector<HTMLElement>('#canvas-root')
              if (canvasRoot) {
                const html = canvasRoot.outerHTML
                if (lastSavedHtmlRef.current !== html) {
                  const snapshot: PagePreviewSnapshot = {
                    pageId,
                    variant,
                    html,
                    pageWidth,
                    pageHeight,
                  }
                  cacheRequestRef.current += 1
                  lastSavedHtmlRef.current = html
                  setCachedScale(Math.min(
                    viewport.clientWidth / pageWidth,
                    viewport.clientHeight / pageHeight
                  ))
                  setCachedState({ key: previewKey, snapshot })
                  void savePagePreview(snapshot)
                }
              }
              setReadyKey(previewKey)
            })
          })
        }

        readinessObserver = new MutationObserver(measureCurrentPage)
        readinessObserver.observe(surface, {
          attributes: true,
          attributeFilter: ['data-export-ready'],
        })
        measureCurrentPage()
      })
      .catch((error) => {
        if (!controller.signal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
          setFailedKey(previewKey)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          releaseRef.current?.()
          releaseRef.current = null
        }
      })

    return () => {
      controller.abort()
      measurementVersion += 1
      readinessObserver?.disconnect()
      geometryObserver?.disconnect()
    }
  }, [mounted, pageId, previewKey, variant])

  const hasVisiblePreview = ready || cachedSnapshot != null

  return (
    <div ref={viewportRef} className="scripture-page-preview-surface" aria-hidden="true">
      {!hasVisiblePreview && (
        <div className={failed
          ? 'scripture-page-preview-placeholder is-error'
          : 'scripture-page-preview-placeholder'}
        >
          {failed ? 'Preview unavailable' : null}
        </div>
      )}
      {/* Serialized from our own static React export DOM; authored text was
          escaped before it entered that DOM. */}
      {cachedSnapshot && !ready && (
        <div
          ref={cachedDocumentRef}
          className="scripture-page-preview-document is-ready"
          style={{ '--scripture-preview-scale': cachedScale } as CSSProperties}
          dangerouslySetInnerHTML={{ __html: cachedSnapshot.html }}
        />
      )}
      {mounted && (
        <div
          ref={documentRef}
          className={ready
            ? 'scripture-page-preview-document is-ready'
            : 'scripture-page-preview-document'}
          style={{ '--scripture-preview-scale': scale } as CSSProperties}
        >
          <BrowserExportPage
            pageId={pageId}
            margin={0}
            priority={acquiredPriority === 'foreground' ? 'focused' : 'background'}
            allowSyntaxFallback
            revision={revision}
            pageNumber={resolvedPageNumber}
          />
        </div>
      )}
    </div>
  )
})
