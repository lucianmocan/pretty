const STORAGE_KEY = 'scripture:documents'

export interface DocumentMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  // Ordered list of page (Yjs doc) ids -- each page is a fully independent
  // Y.Doc via lib/yjs/doc-store.ts's existing getYDoc(id), the exact same
  // mechanism a single-page document already used. pageIds[0] === id for
  // every document's first page, reusing the doc's own id directly (no
  // migration needed for documents saved before multi-page existed --
  // getPageIds() below defaults a missing/empty array to [id]).
  pageIds: string[]
}

/**
 * The list of documents (id, name, timestamps, page ids) lives in
 * localStorage -- small, synchronous, easy to inspect. Actual document
 * content lives in IndexedDB via Yjs (see lib/yjs/doc-store.ts), one Y.Doc
 * per page id; this is just the manifest.
 */
function readAll(): DocumentMeta[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(docs: DocumentMeta[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
  } catch {
    // Best-effort -- e.g. storage quota exceeded or disabled (private browsing).
  }
}

export function listDocuments(): DocumentMeta[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getDocumentMeta(id: string): DocumentMeta | null {
  return readAll().find((d) => d.id === id) ?? null
}

/** Always non-empty -- defaults a missing/empty pageIds (documents saved
 * before multi-page existed) to a single page reusing the document's own id. */
export function getPageIds(id: string): string[] {
  const meta = getDocumentMeta(id)
  return meta?.pageIds && meta.pageIds.length > 0 ? meta.pageIds : [id]
}

export function createDocument(name = 'Untitled'): DocumentMeta {
  const now = Date.now()
  const id = crypto.randomUUID()
  const doc: DocumentMeta = { id, name, createdAt: now, updatedAt: now, pageIds: [id] }
  const docs = readAll()
  docs.push(doc)
  writeAll(docs)
  return doc
}

export function renameDocument(id: string, name: string) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === id)
  if (!doc) return
  doc.name = name
  writeAll(docs)
}

export function touchDocument(id: string) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === id)
  if (!doc) return
  doc.updatedAt = Date.now()
  writeAll(docs)
}

export function deleteDocumentMeta(id: string) {
  writeAll(readAll().filter((d) => d.id !== id))
}

/** Appends a brand-new page (a fresh Yjs doc id, seeded lazily the same way
 * a new single-page document already is, the first time useLayoutTree runs
 * for it) and returns its id. */
export function addPage(docId: string): string {
  const docs = readAll()
  const doc = docs.find((d) => d.id === docId)
  if (!doc) throw new Error(`Document ${docId} not found`)
  const pageId = crypto.randomUUID()
  doc.pageIds = [...(doc.pageIds && doc.pageIds.length > 0 ? doc.pageIds : [docId]), pageId]
  writeAll(docs)
  return pageId
}

/** No-ops if `pageId` is the only page left -- a document always has at
 * least one page. */
export function removePage(docId: string, pageId: string) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === docId)
  if (!doc) return
  const pageIds = doc.pageIds && doc.pageIds.length > 0 ? doc.pageIds : [docId]
  if (pageIds.length <= 1) return
  doc.pageIds = pageIds.filter((id) => id !== pageId)
  writeAll(docs)
}

export function reorderPages(docId: string, pageIds: string[]) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === docId)
  if (!doc) return
  doc.pageIds = pageIds
  writeAll(docs)
}
