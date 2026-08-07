'use client'

import { useSyncExternalStore } from 'react'
import { getYDoc } from '@/lib/yjs/doc-store'
import { ensureRootFrame, toPlainTree } from '@/lib/yjs/layout-store'
import type { LayoutNode } from '@/lib/layout/types'

type LayoutRoot = ReturnType<typeof ensureRootFrame>

interface LayoutTreeStore {
  getSnapshot: () => LayoutNode | null
  subscribe: (listener: () => void) => () => void
  preload: () => Promise<void>
  dispose: () => void
}

const stores = new Map<string, LayoutTreeStore>()
const emptyStore: LayoutTreeStore = {
  getSnapshot: () => null,
  subscribe: () => () => undefined,
  preload: () => Promise.resolve(),
  dispose: () => undefined,
}

function createLayoutTreeStore(docId: string): LayoutTreeStore {
  let snapshot: LayoutNode | null = null
  let root: LayoutRoot | null = null
  let observing = false
  let disposed = false
  let loadPromise: Promise<void> | null = null
  const listeners = new Set<() => void>()

  const notify = () => listeners.forEach((listener) => listener())
  const update = () => {
    if (disposed) return
    snapshot = toPlainTree(getYDoc(docId).doc)
    notify()
  }
  const beginObserving = () => {
    if (!root || observing || listeners.size === 0 || disposed) return
    root.observeDeep(update)
    observing = true
  }
  const stopObserving = () => {
    if (!root || !observing) return
    root.unobserveDeep(update)
    observing = false
  }
  const preload = () => {
    if (loadPromise) return loadPromise
    const entry = getYDoc(docId)
    loadPromise = entry.synced.then(() => {
      if (disposed) return
      root = ensureRootFrame(entry.doc)
      snapshot = toPlainTree(entry.doc)
      beginObserving()
      notify()
    })
    return loadPromise
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      void preload()
      if (root) {
        beginObserving()
        // The document may have changed while this store had no subscribers.
        snapshot = toPlainTree(getYDoc(docId).doc)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stopObserving()
      }
    },
    preload,
    dispose() {
      disposed = true
      stopObserving()
      listeners.clear()
      root = null
      snapshot = null
    },
  }
}

function getLayoutTreeStore(docId: string): LayoutTreeStore {
  let store = stores.get(docId)
  if (!store) {
    store = createLayoutTreeStore(docId)
    stores.set(docId, store)
  }
  return store
}

/** Starts IndexedDB/Yjs hydration and keeps the resulting plain tree ready
 * for a future page switch without mounting a React consumer. */
export function preloadLayoutTree(docId: string): Promise<void> {
  return getLayoutTreeStore(docId).preload()
}

export function clearLayoutTreeCache(docId: string): void {
  stores.get(docId)?.dispose()
  stores.delete(docId)
}

/** A page-aware shared snapshot. Each page owns a separate store, so changing
 * docId can never expose the previous page's tree under the new document id. */
export function useLayoutTree(docId: string | null): LayoutNode | null {
  const store = docId ? getLayoutTreeStore(docId) : emptyStore
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null)
}
