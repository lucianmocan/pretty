'use client'

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { BrowserExportPage } from '@/components/export/browser-export-surfaces'
import {
  acquirePreviewSlot,
  waitForPagePreviewSurface,
} from '@/lib/documents/preview'
import type { PageNumberSettings } from '@/lib/documents/manifest'

interface PagePreviewSurfaceProps {
  pageId: string
  revision?: number
  pageNumber?: number
  pageNumberSettings?: PageNumberSettings
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
 * laying out every page simultaneously.
 */
export const PagePreviewSurface = memo(function PagePreviewSurface({
  pageId,
  revision = 0,
  pageNumber,
  pageNumberSettings,
}: PagePreviewSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<HTMLDivElement>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const requestRef = useRef(0)
  const [shouldMount, setShouldMount] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof IntersectionObserver === 'undefined') {
      setShouldMount(true)
      return
    }
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

    const request = requestRef.current + 1
    requestRef.current = request
    const controller = new AbortController()
    setFailed(false)
    setReady(false)

    void acquirePreviewSlot(pageId, controller.signal)
      .then((release) => {
        if (controller.signal.aborted || requestRef.current !== request) {
          release()
          return
        }
        releaseRef.current = release
        setMounted(true)
      })
      .catch((error) => {
        if (!controller.signal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
          setFailed(true)
        }
      })

    return () => {
      controller.abort()
      releaseRef.current?.()
      releaseRef.current = null
      setMounted(false)
      setReady(false)
    }
  }, [pageId, revision, shouldMount])

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
            setReady(false)
            return
          }

          void document.fonts.ready.then(() => {
            requestAnimationFrame(() => {
              if (controller.signal.aborted || version !== measurementVersion) return
              const viewport = viewportRef.current
              const page = surface.querySelector<HTMLElement>('.scripture-card')
              if (!viewport || !page) return
              const updateScale = () => {
                const pageWidth = page.offsetWidth
                const pageHeight = page.offsetHeight
                if (pageWidth <= 0 || pageHeight <= 0) return
                setScale(Math.min(viewport.clientWidth / pageWidth, viewport.clientHeight / pageHeight))
              }
              geometryObserver?.disconnect()
              geometryObserver = new ResizeObserver(updateScale)
              geometryObserver.observe(viewport)
              geometryObserver.observe(page)
              updateScale()
              setReady(true)
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
          setFailed(true)
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
  }, [mounted, pageId])

  return (
    <div ref={viewportRef} className="scripture-page-preview-surface" aria-hidden="true">
      {!ready && (
        <div className={failed
          ? 'scripture-page-preview-placeholder is-error'
          : 'scripture-page-preview-placeholder'}
        >
          {failed ? 'Preview unavailable' : null}
        </div>
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
            priority="background"
            allowSyntaxFallback
            pageNumber={pageNumber != null && pageNumberSettings
              ? { number: pageNumber, settings: pageNumberSettings }
              : undefined}
          />
        </div>
      )}
    </div>
  )
})
