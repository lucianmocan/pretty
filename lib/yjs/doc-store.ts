import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

export const LAYOUT_MAP = 'layout'

// Explicit transaction origin for every layout-tree mutation (see
// lib/yjs/layout-store.ts) -- passed as doc.transact()'s second argument so
// the shared UndoManager below can track it specifically. Deliberately NOT
// tracking the default `null` origin: y-indexeddb's own initial-load
// transaction (see node_modules/y-indexeddb/src/y-indexeddb.js, the
// `Y.transact(idbPersistence.doc, () => { ...applyUpdate... })` call that
// replays persisted history on startup) also uses `null`, since it never
// passes an origin either. Tracking `null` broadly would let the very first
// Cmd+Z after opening a document undo that whole initial load instead of a
// real edit -- a dedicated origin avoids that entirely.
export const LAYOUT_MUTATION_ORIGIN = Symbol('scripture-layout-mutation')

/** Each block's Tiptap content lives in its own fragment, keyed by block id. */
export function blockFragmentName(blockId: string): string {
  return `block:${blockId}`
}

interface DocEntry {
  doc: Y.Doc
  persistence: IndexeddbPersistence
  synced: Promise<void>
  undoManager: Y.UndoManager | null
}

const docs = new Map<string, DocEntry>()

/**
 * One Y.Doc per document id, cached across the client session so re-renders
 * (and multiple components) share the same instance. IndexedDB-backed, so
 * content survives reloads. Browser-only -- call from client components.
 */
export function getYDoc(id: string): DocEntry {
  let entry = docs.get(id)
  if (!entry) {
    const doc = new Y.Doc()
    const persistence = new IndexeddbPersistence(`scripture:${id}`, doc)
    const synced = new Promise<void>((resolve) => {
      persistence.once('synced', () => resolve())
    })
    entry = { doc, persistence, synced, undoManager: null }
    docs.set(id, entry)
  }
  return entry
}

/**
 * One shared Y.UndoManager per doc, scoped to the WHOLE Y.Doc (not a single
 * fragment) -- Yjs supports passing a Doc directly as scope, which tracks
 * every shared type under it. That gives every block editor plus every
 * layout-tree edit (see lib/yjs/layout-store.ts) a single, unified undo
 * history, matching how Cmd+Z is expected to feel across the whole canvas.
 * Every editor's Collaboration extension must be configured with this same
 * instance (via `yUndoOptions: { undoManager }`) rather than letting each
 * one create its own.
 */
export function getUndoManager(id: string): Y.UndoManager {
  const entry = getYDoc(id)
  if (!entry.undoManager) {
    entry.undoManager = new Y.UndoManager(entry.doc, {
      trackedOrigins: new Set([ySyncPluginKey, LAYOUT_MUTATION_ORIGIN]),
      captureTransaction: (transaction) => transaction.meta.get('addToHistory') !== false,
    })
  }
  return entry.undoManager
}

/**
 * Wipes a document's local IndexedDB state and drops it from the in-memory
 * cache. Does not touch the server-side .data export bridge -- callers
 * clean that up separately (see app/api/documents/[id]/route.ts DELETE).
 */
export async function deleteYDoc(id: string): Promise<void> {
  const entry = docs.get(id)
  if (entry) {
    await entry.persistence.clearData()
    docs.delete(id)
    return
  }
  // Not loaded in this session (e.g. deleting from the dashboard without
  // ever opening the doc) -- still need to clear its IndexedDB database.
  await new IndexeddbPersistence(`scripture:${id}`, new Y.Doc()).clearData()
}

// btoa-based, not Buffer -- this runs in the browser, where Buffer isn't polyfilled.
export function encodeDocState(doc: Y.Doc): string {
  const bytes = Y.encodeStateAsUpdate(doc)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
