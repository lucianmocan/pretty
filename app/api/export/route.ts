import { chromium, type Browser, type Page } from 'playwright'
import type { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'

export const runtime = 'nodejs'

/**
 * Navigates to one page's /print/[pageId] route (rendered via Tiptap's
 * static renderer -- never a live editor) and waits for it to fully settle.
 * Shared by both the PDF and PNG render paths below.
 */
async function preparePrintPage(browser: Browser, origin: string, pageId: string): Promise<Page> {
  const page = await browser.newPage()
  const printUrl = new URL(`/print/${pageId}`, origin).toString()
  const response = await page.goto(printUrl, { waitUntil: 'networkidle' })
  if (response?.status() === 404) {
    await page.close()
    throw new Error(`Page ${pageId} not found`)
  }

  // Fonts can still be mid-swap right after `fonts.ready` resolves; a
  // double rAF wait lets one more paint settle before we measure/print.
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
  return page
}

/**
 * Renders one page to a single-page PDF buffer. Page size comes from that
 * page's own root frame (data-page-size/-width-mm/-height-mm attributes on
 * #canvas-root, set by app/print/[docId]/page.tsx from the stored
 * FrameProps) -- 'content' (default) keeps every prior export's exact-
 * content-size, zero-margin behavior; the fixed formats put that same
 * content onto a bigger page instead of resizing it to fill one.
 */
async function renderPagePdf(browser: Browser, origin: string, pageId: string): Promise<Uint8Array> {
  const page = await preparePrintPage(browser, origin, pageId)
  try {
    const canvasHandle = await page.$('#canvas-root')
    if (!canvasHandle) throw new Error(`Print route for page ${pageId} did not render #canvas-root`)
    const box = await canvasHandle.boundingBox()
    if (!box) throw new Error(`Could not measure #canvas-root for page ${pageId}`)

    const pageSize = await canvasHandle.getAttribute('data-page-size')
    const customWidthMm = await canvasHandle.getAttribute('data-page-width-mm')
    const customHeightMm = await canvasHandle.getAttribute('data-page-height-mm')

    // Round up, never down -- rounding down clips a border/shadow pixel.
    const width = Math.ceil(box.width)
    const height = Math.ceil(box.height)

    const baseOptions = {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: false,
    }

    let sizeOptions: { format?: string; width?: string; height?: string }
    if (pageSize === 'a4') {
      sizeOptions = { format: 'A4' }
    } else if (pageSize === 'letter') {
      sizeOptions = { format: 'Letter' }
    } else if (pageSize === 'custom' && customWidthMm && customHeightMm) {
      sizeOptions = { width: `${customWidthMm}mm`, height: `${customHeightMm}mm` }
    } else {
      sizeOptions = { width: `${width}px`, height: `${height}px` }
    }

    const pdf = await page.pdf({ ...baseOptions, ...sizeOptions, pageRanges: '1' })
    return new Uint8Array(pdf)
  } finally {
    await page.close()
  }
}

/** PNG only makes sense for a single flat image -- one page's content,
 * exactly as rendered (page-size formatting is a PDF-only concept). */
async function renderPagePng(browser: Browser, origin: string, pageId: string): Promise<Uint8Array> {
  const page = await preparePrintPage(browser, origin, pageId)
  try {
    const canvasHandle = await page.$('#canvas-root')
    if (!canvasHandle) throw new Error(`Print route for page ${pageId} did not render #canvas-root`)
    const png = await canvasHandle.screenshot({ type: 'png' })
    return new Uint8Array(png)
  } finally {
    await page.close()
  }
}

/** Merges N single-page PDF buffers (one per document page) into one
 * multi-page PDF, in order. */
async function mergePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  if (buffers.length === 1) return buffers[0]
  const merged = await PDFDocument.create()
  for (const bytes of buffers) {
    const src = await PDFDocument.load(bytes)
    const copiedPages = await merged.copyPages(src, src.getPageIndices())
    for (const copiedPage of copiedPages) merged.addPage(copiedPage)
  }
  return merged.save()
}

/**
 * Drives headless Chromium to render one or more /print/[pageId] routes into
 * an exported PDF (merged into one multi-page document when there's more
 * than one page) or, for a single page, a PNG. `pages` is an ordered,
 * comma-separated list of page ids; `docId` is accepted as a single-page
 * fallback for callers that only ever had one page.
 */
export async function GET(request: NextRequest) {
  const pagesParam = request.nextUrl.searchParams.get('pages')
  const docIdParam = request.nextUrl.searchParams.get('docId')
  const format = request.nextUrl.searchParams.get('format') === 'png' ? 'png' : 'pdf'

  const pageIds = pagesParam
    ? pagesParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : docIdParam
      ? [docIdParam]
      : []

  if (pageIds.length === 0) return new Response('Missing docId or pages', { status: 400 })

  let browser
  try {
    browser = await chromium.launch()
  } catch (err) {
    console.error('Failed to launch Chromium for export', err)
    return new Response(
      'Could not launch the export browser. Run `npx playwright install chromium` and try again.',
      { status: 500 }
    )
  }

  try {
    const origin = request.nextUrl.origin

    if (format === 'png') {
      const png = await renderPagePng(browser, origin, pageIds[0])
      return new Response(Buffer.from(png), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'attachment; filename="scripture.png"',
        },
      })
    }

    const pdfBuffers: Uint8Array[] = []
    for (const pageId of pageIds) {
      pdfBuffers.push(await renderPagePdf(browser, origin, pageId))
    }
    const merged = await mergePdfs(pdfBuffers)

    return new Response(Buffer.from(merged), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="scripture.pdf"',
      },
    })
  } catch (err) {
    console.error('Export failed', err)
    return new Response(err instanceof Error ? err.message : 'Export failed', { status: 500 })
  } finally {
    await browser.close()
  }
}
