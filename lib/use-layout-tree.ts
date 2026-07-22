'use client'

import { useEffect, useState } from 'react'
import { getYDoc } from '@/lib/yjs/doc-store'
import { ensureRootFrame, toPlainTree } from '@/lib/yjs/layout-store'
import type { LayoutNode } from '@/lib/layout/types'

/** Live-updating plain snapshot of the layout tree, ready once the doc has
 * synced from IndexedDB. Subscribes with observeDeep so nested frame/children
 * mutations (not just root-level ones) trigger a re-render. */
export function useLayoutTree(docId: string | null): LayoutNode | null {
  const [tree, setTree] = useState<LayoutNode | null>(null)

  useEffect(() => {
    if (!docId) return
    let cancelled = false
    let cleanup: (() => void) | null = null
    const { doc, synced } = getYDoc(docId)

    synced.then(() => {
      if (cancelled) return
      const root = ensureRootFrame(doc)
      const update = () => setTree(toPlainTree(doc))
      update()
      root.observeDeep(update)
      cleanup = () => root.unobserveDeep(update)
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [docId])

  return tree
}
