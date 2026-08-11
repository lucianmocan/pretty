/** Client-only wrapper around the `mupdf` WASM package -- rendering PDF
 * pages happens entirely in the browser, no server round-trip. Loaded via
 * dynamic import (never at module scope) so the WASM binary is only fetched
 * once a user actually picks a PDF, not on every page load. */

// Keep the package boundary local to this file so everything downstream
// only sees the small PdfDocument wrapper used by the picker.
type MupdfModule = typeof import('mupdf')

let mupdfPromise: Promise<MupdfModule> | null = null

function loadMupdf(): Promise<MupdfModule> {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

/** Wraps one opened PDF document -- call destroy() once done (closing the
 * picker dialog) to free the underlying WASM memory. */
export class PdfDocument {
  private constructor(
    private readonly mupdf: MupdfModule,
    private readonly doc: InstanceType<MupdfModule['Document']>
  ) {}

  static async open(file: File): Promise<PdfDocument> {
    const mupdf = await loadMupdf()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
    return new PdfDocument(mupdf, doc)
  }

  get pageCount(): number {
    return this.doc.countPages()
  }

  /** Renders a raster preview for the picker grid -- NOT what gets
   * inserted onto the canvas (see renderPageSvg for that). Caller owns the
   * returned blob: URL and must URL.revokeObjectURL it when done. */
  renderThumbnail(pageIndex: number, targetWidthPx = 320): string {
    const page = this.doc.loadPage(pageIndex)
    let pixmap: ReturnType<typeof page.toPixmap> | null = null
    try {
      const bounds = page.getBounds() as [number, number, number, number]
      const widthPts = bounds[2] - bounds[0]
      const scale = widthPts > 0 ? targetWidthPx / widthPts : 1
      pixmap = page.toPixmap(this.mupdf.Matrix.scale(scale, scale), this.mupdf.ColorSpace.DeviceRGB)
      // Re-copy into a plain ArrayBuffer-backed Uint8Array -- mupdf's own
      // return type is backed by ArrayBufferLike (which admits
      // SharedArrayBuffer), not assignable to Blob's BlobPart as-is.
      const png = new Uint8Array(pixmap.asPNG() as Uint8Array)
      return URL.createObjectURL(new Blob([png], { type: 'image/png' }))
    } finally {
      pixmap?.destroy()
      page.destroy()
    }
  }

  /** True vector conversion of one page -- what actually gets uploaded and
   * inserted as an image block, preserving the page as real vector SVG
   * rather than a rasterized picture. */
  renderPageSvg(pageIndex: number): string {
    const page = this.doc.loadPage(pageIndex)
    const buffer = new this.mupdf.Buffer()
    const writer = new this.mupdf.DocumentWriter(buffer, 'svg', '')
    let device: ReturnType<typeof writer.beginPage> | null = null
    try {
      device = writer.beginPage(page.getBounds())
      page.run(device, this.mupdf.Matrix.identity)
      device.close()
      writer.endPage()
      writer.close()
      return buffer.asString()
    } finally {
      device?.destroy()
      writer.destroy()
      buffer.destroy()
      page.destroy()
    }
  }

  destroy() {
    this.doc.destroy?.()
  }
}
