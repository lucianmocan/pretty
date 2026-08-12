'use client'

import type { ComponentProps } from 'react'
import { ImageVisual } from '@/components/canvas/image-visual'
import { useLocalImageSrc } from '@/lib/images/use-local-image-src'

/** export-document.tsx renders plain data (no hooks of its own), so it
 * can't resolve a `local:{id}` reference itself. This client wrapper does
 * that resolution (see lib/images/use-local-image-src.ts) before rendering
 * the same shared ImageVisual everything else uses. Nothing here is
 * fetched from, or sent to, any server -- the image lives in this same
 * browser's IndexedDB the whole time. */
export function LocalImageVisual(props: ComponentProps<typeof ImageVisual>) {
  const resolvedSrc = useLocalImageSrc(props.src)
  if (!resolvedSrc) return null
  return <ImageVisual {...props} src={resolvedSrc} />
}
