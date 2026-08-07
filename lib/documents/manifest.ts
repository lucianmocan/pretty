const STORAGE_KEY = 'scripture:documents'

export type PageNumberVerticalPosition = 'top' | 'bottom'
export type PageNumberHorizontalPosition = 'left' | 'center' | 'right'
export type PageNumberNumeralStyle = 'arabic' | 'roman'

export interface PageNumberTypography {
  fontFamily: string
  fontSource: 'local' | 'google'
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  fontSize: number
  lineHeight: number
  letterSpacing: number
  textColor: string
  highlightColor: string | null
  underline: boolean
  strike: boolean
}

export interface PageNumberSettings {
  enabled: boolean
  vertical: PageNumberVerticalPosition
  horizontal: PageNumberHorizontalPosition
  numeralStyle: PageNumberNumeralStyle
  startPageId: string | null
  hiddenPageIds: string[]
  typography: PageNumberTypography
}

export const DEFAULT_PAGE_NUMBER_TYPOGRAPHY: PageNumberTypography = {
  fontFamily: 'Geist Sans',
  fontSource: 'local',
  fontWeight: 400,
  fontStyle: 'normal',
  fontSize: 16,
  lineHeight: 1.5,
  letterSpacing: 0,
  textColor: 'currentColor',
  highlightColor: null,
  underline: false,
  strike: false,
}

export const DEFAULT_PAGE_NUMBER_SETTINGS: PageNumberSettings = {
  enabled: false,
  vertical: 'bottom',
  horizontal: 'center',
  numeralStyle: 'arabic',
  startPageId: null,
  hiddenPageIds: [],
  typography: DEFAULT_PAGE_NUMBER_TYPOGRAPHY,
}

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
  // Optional user-facing names keyed by page id. Kept separate from pageIds
  // so reordering never changes a page's name; absent entries use the
  // position-aware number plus an "Untitled" fallback in the UI.
  pageNames?: Record<string, string>
  pageNumberSettings?: PageNumberSettings
  // Shown as a card in the dashboard's "Pinned" section instead of the
  // plain list below it. Optional/undefined (not a plain boolean default)
  // so documents saved before this existed don't need a migration --
  // every read site already treats a missing value as "not pinned".
  pinned?: boolean
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

export function getPageNames(id: string): Record<string, string> {
  const names = getDocumentMeta(id)?.pageNames
  return names && typeof names === 'object' ? { ...names } : {}
}

export function getPageNumberSettings(id: string): PageNumberSettings {
  const settings = getDocumentMeta(id)?.pageNumberSettings
  const typography = settings?.typography
  return {
    enabled: settings?.enabled === true,
    vertical: settings?.vertical === 'top' ? 'top' : DEFAULT_PAGE_NUMBER_SETTINGS.vertical,
    horizontal:
      settings?.horizontal === 'left' || settings?.horizontal === 'right'
        ? settings.horizontal
        : DEFAULT_PAGE_NUMBER_SETTINGS.horizontal,
    numeralStyle: settings?.numeralStyle === 'roman' ? 'roman' : DEFAULT_PAGE_NUMBER_SETTINGS.numeralStyle,
    startPageId: typeof settings?.startPageId === 'string' ? settings.startPageId : null,
    hiddenPageIds: Array.isArray(settings?.hiddenPageIds)
      ? settings.hiddenPageIds.filter((pageId): pageId is string => typeof pageId === 'string')
      : [],
    typography: {
      fontFamily: typeof typography?.fontFamily === 'string'
        ? typography.fontFamily
        : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.fontFamily,
      fontSource: typography?.fontSource === 'google' ? 'google' : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.fontSource,
      fontWeight: typeof typography?.fontWeight === 'number'
        ? typography.fontWeight
        : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.fontWeight,
      fontStyle: typography?.fontStyle === 'italic' ? 'italic' : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.fontStyle,
      fontSize: typeof typography?.fontSize === 'number'
        ? typography.fontSize
        : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.fontSize,
      lineHeight: typeof typography?.lineHeight === 'number'
        ? typography.lineHeight
        : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.lineHeight,
      letterSpacing: typeof typography?.letterSpacing === 'number'
        ? typography.letterSpacing
        : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.letterSpacing,
      textColor: typeof typography?.textColor === 'string'
        ? typography.textColor
        : DEFAULT_PAGE_NUMBER_TYPOGRAPHY.textColor,
      highlightColor: typeof typography?.highlightColor === 'string' ? typography.highlightColor : null,
      underline: typography?.underline === true,
      strike: typography?.strike === true,
    },
  }
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

export function togglePin(id: string) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === id)
  if (!doc) return
  doc.pinned = !doc.pinned
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
  doc.updatedAt = Date.now()
  writeAll(docs)
  return pageId
}

/** Inserts a fully-copied page directly after its source. Content cloning is
 * completed before this is called, so the manifest never exposes a partial
 * duplicate if copying an image or the Yjs document fails. */
export function insertDuplicatedPage(docId: string, sourcePageId: string, duplicatePageId: string) {
  const docs = readAll()
  const doc = docs.find((item) => item.id === docId)
  if (!doc) throw new Error(`Document ${docId} not found`)
  const pageIds = doc.pageIds && doc.pageIds.length > 0 ? doc.pageIds : [docId]
  const sourceIndex = pageIds.indexOf(sourcePageId)
  if (sourceIndex < 0) throw new Error('Page not found.')

  const nextPageIds = [...pageIds]
  nextPageIds.splice(sourceIndex + 1, 0, duplicatePageId)
  doc.pageIds = nextPageIds

  const sourceName = doc.pageNames?.[sourcePageId]
  if (sourceName) {
    doc.pageNames = { ...(doc.pageNames ?? {}), [duplicatePageId]: `${sourceName} copy` }
  }
  if (doc.pageNumberSettings?.hiddenPageIds?.includes(sourcePageId)) {
    doc.pageNumberSettings = {
      ...doc.pageNumberSettings,
      hiddenPageIds: [...doc.pageNumberSettings.hiddenPageIds, duplicatePageId],
    }
  }
  doc.updatedAt = Date.now()
  writeAll(docs)
}

/** No-ops if `pageId` is the only page left -- a document always has at
 * least one page. */
export function removePage(docId: string, pageId: string) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === docId)
  if (!doc) return
  const pageIds = doc.pageIds && doc.pageIds.length > 0 ? doc.pageIds : [docId]
  if (pageIds.length <= 1) return
  const removedIndex = pageIds.indexOf(pageId)
  doc.pageIds = pageIds.filter((id) => id !== pageId)
  if (doc.pageNames) {
    const nextNames = { ...doc.pageNames }
    delete nextNames[pageId]
    doc.pageNames = nextNames
  }
  if (doc.pageNumberSettings) {
    const nextSettings = {
      ...doc.pageNumberSettings,
      hiddenPageIds: (doc.pageNumberSettings.hiddenPageIds ?? []).filter((id) => id !== pageId),
    }
    if (nextSettings.startPageId === pageId) {
      nextSettings.startPageId = doc.pageIds[Math.min(Math.max(removedIndex, 0), doc.pageIds.length - 1)] ?? null
    }
    doc.pageNumberSettings = nextSettings
  }
  doc.updatedAt = Date.now()
  writeAll(docs)
}

export function renamePage(docId: string, pageId: string, name: string) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === docId)
  const pageIds = doc?.pageIds && doc.pageIds.length > 0 ? doc.pageIds : [docId]
  if (!doc || !pageIds.includes(pageId)) return
  const nextNames = { ...(doc.pageNames ?? {}) }
  const trimmedName = name.trim()
  if (trimmedName) nextNames[pageId] = trimmedName
  else delete nextNames[pageId]
  doc.pageNames = nextNames
  doc.updatedAt = Date.now()
  writeAll(docs)
}

export function setPageNumberSettings(docId: string, settings: PageNumberSettings) {
  const docs = readAll()
  const doc = docs.find((item) => item.id === docId)
  if (!doc) return
  doc.pageNumberSettings = { ...settings }
  doc.updatedAt = Date.now()
  writeAll(docs)
}

export function reorderPages(docId: string, pageIds: string[]) {
  const docs = readAll()
  const doc = docs.find((d) => d.id === docId)
  if (!doc) return
  doc.pageIds = pageIds
  doc.updatedAt = Date.now()
  writeAll(docs)
}
