'use client'

import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageBlockProps {
  src: string
  alt: string
  onUploaded: (url: string) => void
}

/** Upload UI when empty, the actual image once uploaded. The uploaded file
 * is stored server-side (see lib/images/store.ts + app/api/images) and
 * referenced by URL, not embedded as a data URI in the Yjs doc -- keeps the
 * collaborative doc small regardless of image size. */
export function ImageBlock({ src, alt, onUploaded }: ImageBlockProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/images', { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const { url } = (await res.json()) as { url: string }
      onUploaded(url)
    } catch (err) {
      console.error('Image upload failed', err)
      setError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (!src) {
    return (
      // onPointerDown stopPropagation too, not just onClick -- in canvas
      // mode, the parent leaf's whole body has its own onPointerDown wired
      // to start a move-drag (see frame-node.tsx's beginMoveDrag), which
      // calls preventDefault() and silently suppresses the click event this
      // button needs to open the file picker. Without stopping it here
      // first, "Upload image" does nothing at all inside a canvas-mode frame.
      <div
        className="scripture-image-empty"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
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
          <ImagePlus /> {uploading ? 'Uploading…' : 'Upload image'}
        </Button>
        {error && <p className="scripture-error-text">{error}</p>}
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/images route, not a next/image remote-domain candidate
  return <img className="scripture-image" src={src} alt={alt} />
}
