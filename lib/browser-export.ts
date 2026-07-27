'use client'

import { PDFDocument } from 'pdf-lib'
import { domToBlob, waitUntilLoad } from 'modern-screenshot'
import { exportRasterScale, type ExportQuality } from '@/lib/app-preferences'

const CSS_PX_TO_PDF_POINTS = 72 / 96
const MM_TO_PDF_POINTS = 72 / 25.4
// A PNG is itself the authored canvas, so one CSS pixel should become one
// image pixel. PDF pages still benefit from a denser backing image because
// their physical size is independent of the embedded raster resolution.

interface CapturedPage {
  png: Uint8Array
  pngBlob: Blob
  widthPx: number
  heightPx: number
  pageSize: string
  customWidthMm: number | null
  customHeightMm: number | null
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export async function waitForExportSurfaces(
  rootRef: React.RefObject<HTMLDivElement | null>,
  pageIds: string[]
): Promise<HTMLElement[]> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const root = rootRef.current
    if (root) {
      const pages = pageIds.map((pageId) =>
        root.querySelector<HTMLElement>(`.scripture-browser-export-page[data-export-page-id="${CSS.escape(pageId)}"]`)
      )
      const failedPage = pages.find((page) => page?.dataset.exportError)
      if (failedPage?.dataset.exportError) {
        throw new Error(`Could not prepare syntax highlighting for export: ${failedPage.dataset.exportError}`)
      }
      if (pages.every((page) => page?.dataset.exportReady === 'true')) {
        await document.fonts.ready
        await nextPaint()
        return pages as HTMLElement[]
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  throw new Error('Timed out while preparing pages for export.')
}

async function capturePage(
  surface: HTMLElement,
  rasterScale: number,
  transparentBackground: boolean
): Promise<CapturedPage> {
  const canvasRoot = surface.querySelector<HTMLElement>('#canvas-root')
  if (!canvasRoot) throw new Error('The export page did not render its canvas.')
  await waitUntilLoad(canvasRoot, { timeout: 30_000 })

  const widthPx = Math.ceil(canvasRoot.getBoundingClientRect().width)
  const heightPx = Math.ceil(canvasRoot.getBoundingClientRect().height)
  if (widthPx <= 0 || heightPx <= 0) throw new Error('The export page has no visible content.')

  const pngBlob = await domToBlob(canvasRoot, {
    type: 'image/png',
    scale: rasterScale,
    width: widthPx,
    height: heightPx,
    backgroundColor: transparentBackground
      ? null
      : getComputedStyle(canvasRoot.querySelector<HTMLElement>('.scripture-card') ?? canvasRoot).backgroundColor,
    font: { preferredFormat: 'woff2' },
    fetch: { requestInit: { cache: 'force-cache' } },
  })
  const png = new Uint8Array(await pngBlob.arrayBuffer())

  const parseOptionalNumber = (value: string | undefined) => {
    if (!value) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return {
    png,
    pngBlob,
    widthPx,
    heightPx,
    pageSize: canvasRoot.dataset.pageSize ?? 'content',
    customWidthMm: parseOptionalNumber(canvasRoot.dataset.pageWidthMm),
    customHeightMm: parseOptionalNumber(canvasRoot.dataset.pageHeightMm),
  }
}

function pdfPageSize(page: CapturedPage): { width: number; height: number } {
  const contentWidth = page.widthPx * CSS_PX_TO_PDF_POINTS
  const contentHeight = page.heightPx * CSS_PX_TO_PDF_POINTS
  if (page.pageSize === 'a4') {
    return { width: 210 * MM_TO_PDF_POINTS, height: Math.max(297 * MM_TO_PDF_POINTS, contentHeight) }
  }
  if (page.pageSize === 'letter') {
    return { width: 215.9 * MM_TO_PDF_POINTS, height: Math.max(279.4 * MM_TO_PDF_POINTS, contentHeight) }
  }
  if (page.pageSize === 'custom' && page.customWidthMm && page.customHeightMm) {
    return {
      width: page.customWidthMm * MM_TO_PDF_POINTS,
      height: Math.max(page.customHeightMm * MM_TO_PDF_POINTS, contentHeight),
    }
  }
  return { width: contentWidth, height: contentHeight }
}

export async function createBrowserExport(
  surfaces: HTMLElement[],
  format: 'png' | 'pdf',
  options?: { quality?: ExportQuality; transparentBackground?: boolean }
): Promise<Blob> {
  if (surfaces.length === 0) throw new Error('There are no pages to export.')
  const captures: CapturedPage[] = []
  const count = format === 'png' ? 1 : surfaces.length
  const rasterScale = exportRasterScale(format, options?.quality ?? 'standard')
  for (let index = 0; index < count; index += 1) {
    captures.push(await capturePage(surfaces[index], rasterScale, options?.transparentBackground ?? true))
  }

  if (format === 'png') return captures[0].pngBlob

  const pdf = await PDFDocument.create()
  for (const capture of captures) {
    const contentWidth = capture.widthPx * CSS_PX_TO_PDF_POINTS
    const contentHeight = capture.heightPx * CSS_PX_TO_PDF_POINTS
    const size = pdfPageSize(capture)
    const page = pdf.addPage([size.width, size.height])
    const image = await pdf.embedPng(capture.png)
    page.drawImage(image, {
      x: 0,
      y: size.height - contentHeight,
      width: contentWidth,
      height: contentHeight,
    })
  }

  const bytes = await pdf.save()
  return new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })
}
