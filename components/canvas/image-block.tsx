'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadImageFile, isPdfFile } from '@/lib/images/client'
import { useLocalImageSrc } from '@/lib/images/use-local-image-src'
import type { ImageClipShape } from '@/lib/layout/types'
import { ImageVisual } from '@/components/canvas/image-visual'

interface ImageBlockProps {
  src: string
  alt: string
  radius: number
  clipShape: ImageClipShape
  // Normalized [0,1] crop window into the image's natural bounds --
  // 0,0,1,1 is uncropped.
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  intrinsicWidth: number
  intrinsicHeight: number
  frameWidth?: number | null
  frameHeight?: number | null
  opacity: number
  brightness: number
  contrast: number
  saturation: number
  hue: number
  grayscale: number
  blur: number
  onUploaded: (url: string) => void
  // A PDF needs page selection first (see PdfPagePickerDialog), so it never
  // goes through handleFile/onUploaded directly -- this hands it up instead
  // of uploading it as-is.
  onPdfSelected: (file: File) => void
}

/** Upload UI when empty, the actual image once uploaded. The uploaded file
 * is stored in this browser's IndexedDB (see lib/images/local-store.ts) and
 * referenced by a short `local:{id}` string, not embedded as a data URI in
 * the Yjs doc -- keeps the collaborative doc small regardless of image
 * size, and keeps every image entirely local (never uploaded anywhere). */
export function ImageBlock({
  src,
  alt,
  radius,
  clipShape,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  intrinsicWidth,
  intrinsicHeight,
  frameWidth,
  frameHeight,
  opacity,
  brightness,
  contrast,
  saturation,
  hue,
  grayscale,
  blur,
  onUploaded,
  onPdfSelected,
}: ImageBlockProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `src` is a `local:{id}` reference into this browser's IndexedDB (see
  // lib/images/local-store.ts), not a directly-usable URL -- resolve it to
  // an actual blob: URL before handing it to ImageVisual.
  const resolvedSrc = useLocalImageSrc(src)
  // The <img> itself takes a moment to fetch/decode after `src` changes
  // (uploading a fresh photo, or a PDF page's freshly-converted SVG) --
  // without this, the block just sits blank with no sign anything is
  // happening until the browser finishes loading it.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => setLoaded(false), [resolvedSrc])

  async function handleFile(file: File) {
    if (isPdfFile(file)) {
      onPdfSelected(file)
      return
    }
    setUploading(true)
    setError(null)
    try {
      onUploaded(await uploadImageFile(file))
    } catch (err) {
      console.error('Image upload failed', err)
      setError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (!src) {
    return (
      // No stopPropagation here: frame-node.tsx's beginMoveDrag already
      // exempts pointerdowns that land on a button/input/etc (its own
      // `closest(...)` guard), so the empty placeholder's body still starts
      // a canvas-mode move-drag same as any other block -- only clicking
      // the button itself is exempted from that.
      <div
        className="scripture-image-empty"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset immediately, not just on failure -- otherwise re-picking
            // the SAME file (e.g. to retry after a failed upload) fires no
            // change event at all, since the input's value string didn't
            // change, and the button silently appears to do nothing.
            e.target.value = ''
            if (file) handleFile(file)
          }}
        />
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus /> {uploading ? 'Uploading…' : 'Upload image or PDF'}
        </Button>
        {error && <p className="scripture-error-text">{error}</p>}
      </div>
    )
  }

  const overlay = !loaded ? (
    <div className="scripture-image-loading" role="status" aria-label="Loading image">
      <LoaderCircle className="animate-spin" size={18} />
    </div>
  ) : undefined

  // Still resolving the local:{id} reference to a blob: URL (see
  // useLocalImageSrc) -- render just the loading overlay rather than an
  // <img>/<image> with an empty src, which React 19 warns about (and which
  // would briefly flash a broken-image icon anyway).
  if (!resolvedSrc) return overlay ?? null

  return (
    <ImageVisual
      src={resolvedSrc}
      alt={alt}
      radius={radius}
      clipShape={clipShape}
      cropX={cropX}
      cropY={cropY}
      cropWidth={cropWidth}
      cropHeight={cropHeight}
      intrinsicWidth={intrinsicWidth}
      intrinsicHeight={intrinsicHeight}
      frameWidth={frameWidth}
      frameHeight={frameHeight}
      opacity={opacity}
      brightness={brightness}
      contrast={contrast}
      saturation={saturation}
      hue={hue}
      grayscale={grayscale}
      blur={blur}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      overlay={overlay}
    />
  )
}
