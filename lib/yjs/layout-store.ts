import * as Y from 'yjs'
import { LAYOUT_MAP } from './doc-store'
import {
  DEFAULT_FRAME_PROPS,
  DEFAULT_ROOT_FRAME_PROPS,
  DEFAULT_CODE_BLOCK_PROPS,
  DEFAULT_IMAGE_BLOCK_PROPS,
  type FrameProps,
  type CodeBlockProps,
  type ImageBlockProps,
  type LayoutNode,
  type CalloutAnnotation,
} from '@/lib/layout/types'
import { toggleLine } from '@/lib/layout/line-ranges'

export const ROOT_ID = 'root'

export function getRootMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(LAYOUT_MAP)
}

/** Client-only bootstrap: seeds a default root frame on a brand new doc. */
export function ensureRootFrame(doc: Y.Doc): Y.Map<unknown> {
  const root = getRootMap(doc)
  if (!root.has('id')) {
    doc.transact(() => {
      root.set('id', ROOT_ID)
      root.set('kind', 'frame')
      setFrameFields(root, DEFAULT_ROOT_FRAME_PROPS)
      root.set('children', new Y.Array())
    })
  }
  return root
}

/** Seeds a freshly-created (still-empty) root frame from a chosen template
 * (see lib/templates.ts) -- applies the template's root-level prop overrides
 * (e.g. direction: 'row' for a side-by-side layout) and pushes its starter
 * children. Called once, right after ensureRootFrame, before the user has
 * navigated to the editor -- a no-op set of overrides/children (the "Blank"
 * template) leaves the plain default root untouched. */
export function seedRootFrame(doc: Y.Doc, template: { rootProps?: Partial<FrameProps>; children: LayoutNode[] }) {
  const root = ensureRootFrame(doc)
  doc.transact(() => {
    if (template.rootProps) {
      for (const [key, value] of Object.entries(template.rootProps)) {
        root.set(key, value)
      }
    }
    if (template.children.length > 0) {
      const children = root.get('children') as Y.Array<Y.Map<unknown>>
      children.push(template.children.map(buildYNode))
    }
  })
}

/** Read-only: the print route must never seed data into a doc it only reads. */
export function toPlainTree(doc: Y.Doc): LayoutNode | null {
  const root = getRootMap(doc)
  if (!root.has('id')) return null
  return root.toJSON() as LayoutNode
}

function setFrameFields(map: Y.Map<unknown>, props: FrameProps) {
  map.set('direction', props.direction)
  map.set('gap', props.gap)
  map.set('padding', props.padding)
  map.set('align', props.align)
  map.set('justify', props.justify)
  map.set('background', props.background)
  map.set('backgroundAuto', props.backgroundAuto)
  map.set('radius', props.radius)
  map.set('childLayout', props.childLayout)
  // Callouts are a small, infrequently-changed list -- stored as a plain JSON
  // value (not a nested Y.Array/Y.Map tree) since they don't need per-field
  // collaborative merging, only whole-list read/replace.
  map.set('callouts', props.callouts)
  map.set('pageSize', props.pageSize)
  map.set('customPageWidthMm', props.customPageWidthMm)
  map.set('customPageHeightMm', props.customPageHeightMm)
}

function setCodeFields(map: Y.Map<unknown>, props: CodeBlockProps) {
  map.set('language', props.language)
  map.set('theme', props.theme)
  map.set('fontFamily', props.fontFamily)
  map.set('filename', props.filename)
  map.set('chromeStyle', props.chromeStyle)
  map.set('showLineNumbers', props.showLineNumbers)
  map.set('startLineNumber', props.startLineNumber)
  map.set('ligatures', props.ligatures)
  map.set('lineHeight', props.lineHeight)
  map.set('letterSpacing', props.letterSpacing)
  map.set('highlightLines', props.highlightLines)
  map.set('trimRanges', props.trimRanges)
  map.set('diffLines', props.diffLines)
}

function setImageFields(map: Y.Map<unknown>, props: ImageBlockProps) {
  map.set('src', props.src)
  map.set('alt', props.alt)
}

function findNodeMap(node: Y.Map<unknown>, id: string): Y.Map<unknown> | null {
  if (node.get('id') === id) return node
  const children = node.get('children') as Y.Array<Y.Map<unknown>> | undefined
  if (!children) return null
  for (const child of children.toArray()) {
    const found = findNodeMap(child, id)
    if (found) return found
  }
  return null
}

interface ParentInfo {
  children: Y.Array<Y.Map<unknown>>
  index: number
}

function findParentInfo(node: Y.Map<unknown>, id: string): ParentInfo | null {
  const children = node.get('children') as Y.Array<Y.Map<unknown>> | undefined
  if (!children) return null
  const arr = children.toArray()
  const index = arr.findIndex((child) => child.get('id') === id)
  if (index !== -1) return { children, index }
  for (const child of arr) {
    const found = findParentInfo(child, id)
    if (found) return found
  }
  return null
}

/**
 * Rebuilds a fresh Y.Map (+ nested Y.Arrays/Y.Maps) from a plain snapshot.
 * Needed for moveNode: Yjs shared types can only be integrated into a doc
 * once, so "moving" an item means delete + recreate, not delete + reinsert
 * the same instance. Leaf ids are preserved, so each block's actual Tiptap
 * content (a separate top-level fragment keyed by id) is untouched.
 */
function buildYNode(plain: LayoutNode): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  map.set('id', plain.id)
  map.set('kind', plain.kind)
  map.set('width', plain.width ?? null)
  map.set('height', plain.height ?? null)
  map.set('x', plain.x ?? null)
  map.set('y', plain.y ?? null)
  if (plain.kind === 'frame') {
    setFrameFields(map, {
      direction: plain.direction ?? DEFAULT_FRAME_PROPS.direction,
      gap: plain.gap ?? DEFAULT_FRAME_PROPS.gap,
      padding: plain.padding ?? DEFAULT_FRAME_PROPS.padding,
      align: plain.align ?? DEFAULT_FRAME_PROPS.align,
      justify: plain.justify ?? DEFAULT_FRAME_PROPS.justify,
      background: plain.background ?? DEFAULT_FRAME_PROPS.background,
      backgroundAuto: plain.backgroundAuto ?? DEFAULT_FRAME_PROPS.backgroundAuto,
      radius: plain.radius ?? DEFAULT_FRAME_PROPS.radius,
      childLayout: plain.childLayout ?? DEFAULT_FRAME_PROPS.childLayout,
      callouts: plain.callouts ?? DEFAULT_FRAME_PROPS.callouts,
      pageSize: plain.pageSize ?? DEFAULT_FRAME_PROPS.pageSize,
      customPageWidthMm: plain.customPageWidthMm ?? DEFAULT_FRAME_PROPS.customPageWidthMm,
      customPageHeightMm: plain.customPageHeightMm ?? DEFAULT_FRAME_PROPS.customPageHeightMm,
    })
    const children = new Y.Array<Y.Map<unknown>>()
    children.push((plain.children ?? []).map(buildYNode))
    map.set('children', children)
  } else if (plain.kind === 'code') {
    setCodeFields(map, {
      language: plain.language ?? DEFAULT_CODE_BLOCK_PROPS.language,
      theme: plain.theme ?? DEFAULT_CODE_BLOCK_PROPS.theme,
      fontFamily: plain.fontFamily ?? DEFAULT_CODE_BLOCK_PROPS.fontFamily,
      filename: plain.filename ?? DEFAULT_CODE_BLOCK_PROPS.filename,
      chromeStyle: plain.chromeStyle ?? DEFAULT_CODE_BLOCK_PROPS.chromeStyle,
      showLineNumbers: plain.showLineNumbers ?? DEFAULT_CODE_BLOCK_PROPS.showLineNumbers,
      startLineNumber: plain.startLineNumber ?? DEFAULT_CODE_BLOCK_PROPS.startLineNumber,
      ligatures: plain.ligatures ?? DEFAULT_CODE_BLOCK_PROPS.ligatures,
      lineHeight: plain.lineHeight ?? DEFAULT_CODE_BLOCK_PROPS.lineHeight,
      letterSpacing: plain.letterSpacing ?? DEFAULT_CODE_BLOCK_PROPS.letterSpacing,
      highlightLines: plain.highlightLines ?? DEFAULT_CODE_BLOCK_PROPS.highlightLines,
      trimRanges: plain.trimRanges ?? DEFAULT_CODE_BLOCK_PROPS.trimRanges,
      diffLines: plain.diffLines ?? DEFAULT_CODE_BLOCK_PROPS.diffLines,
    })
  } else if (plain.kind === 'image') {
    setImageFields(map, {
      src: plain.src ?? DEFAULT_IMAGE_BLOCK_PROPS.src,
      alt: plain.alt ?? DEFAULT_IMAGE_BLOCK_PROPS.alt,
    })
  }
  return map
}

// Return the id alongside the map rather than reading it back with .get() --
// Yjs warns ("Invalid access") when you read from a type before it's been
// inserted into a document, even though the read itself is functionally fine.
function createLeafMap(kind: 'code' | 'text' | 'image', language?: string): { map: Y.Map<unknown>; id: string } {
  const id = crypto.randomUUID()
  const map = new Y.Map<unknown>()
  map.set('id', id)
  map.set('kind', kind)
  map.set('width', null)
  map.set('height', null)
  map.set('x', null)
  map.set('y', null)
  if (kind === 'code') {
    setCodeFields(map, { ...DEFAULT_CODE_BLOCK_PROPS, language: language ?? DEFAULT_CODE_BLOCK_PROPS.language })
  } else if (kind === 'image') {
    setImageFields(map, DEFAULT_IMAGE_BLOCK_PROPS)
  }
  return { map, id }
}

function createFrameMap(): { map: Y.Map<unknown>; id: string } {
  const id = crypto.randomUUID()
  const map = new Y.Map<unknown>()
  map.set('id', id)
  map.set('kind', 'frame')
  map.set('width', null)
  map.set('height', null)
  map.set('x', null)
  map.set('y', null)
  setFrameFields(map, DEFAULT_FRAME_PROPS)
  map.set('children', new Y.Array())
  return { map, id }
}

/** Small cascading offset so newly-canvas-positioned nodes don't all stack
 * exactly on top of each other -- same idea as pasting in Figma/Illustrator. */
function cascadeOffset(index: number): number {
  return 24 + (index % 8) * 16
}

export function addBlock(
  doc: Y.Doc,
  parentId: string,
  kind: 'code' | 'text' | 'image',
  language?: string
): string {
  const root = ensureRootFrame(doc)
  const parent = findNodeMap(root, parentId)
  if (!parent) throw new Error(`Frame ${parentId} not found`)
  const { map: leaf, id } = createLeafMap(kind, language)
  doc.transact(() => {
    const children = parent.get('children') as Y.Array<Y.Map<unknown>>
    if (parent.get('childLayout') === 'canvas') {
      const offset = cascadeOffset(children.length)
      leaf.set('x', offset)
      leaf.set('y', offset)
    }
    children.push([leaf])
  })
  return id
}

export function addFrame(doc: Y.Doc, parentId: string): string {
  const root = ensureRootFrame(doc)
  const parent = findNodeMap(root, parentId)
  if (!parent) throw new Error(`Frame ${parentId} not found`)
  const { map: frame, id } = createFrameMap()
  doc.transact(() => {
    const children = parent.get('children') as Y.Array<Y.Map<unknown>>
    if (parent.get('childLayout') === 'canvas') {
      const offset = cascadeOffset(children.length)
      frame.set('x', offset)
      frame.set('y', offset)
    }
    children.push([frame])
  })
  return id
}

export function removeNode(doc: Y.Doc, id: string) {
  const root = ensureRootFrame(doc)
  if (id === ROOT_ID) return
  const info = findParentInfo(root, id)
  if (!info) return
  doc.transact(() => {
    info.children.delete(info.index, 1)
  })
}

export function moveNode(doc: Y.Doc, id: string, direction: 'up' | 'down') {
  const root = ensureRootFrame(doc)
  if (id === ROOT_ID) return
  const info = findParentInfo(root, id)
  if (!info) return
  const { children, index } = info
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= children.length) return
  doc.transact(() => {
    const plain = children.get(index).toJSON() as LayoutNode
    children.delete(index, 1)
    children.insert(newIndex, [buildYNode(plain)])
  })
}

/**
 * Drag-and-drop reordering: moves `draggedId` to sit where `targetId`
 * currently is, among the same parent's children. Cross-parent dragging
 * (moving a block into a different frame) isn't supported yet -- dropping
 * on a node in a different frame is a silent no-op.
 */
export function moveNodeBeforeSibling(doc: Y.Doc, draggedId: string, targetId: string) {
  if (draggedId === targetId || draggedId === ROOT_ID || targetId === ROOT_ID) return
  const root = ensureRootFrame(doc)
  const draggedInfo = findParentInfo(root, draggedId)
  const targetInfo = findParentInfo(root, targetId)
  if (!draggedInfo || !targetInfo || draggedInfo.children !== targetInfo.children) return

  const { children, index } = draggedInfo
  let insertAt = targetInfo.index
  if (insertAt === index) return
  doc.transact(() => {
    const plain = children.get(index).toJSON() as LayoutNode
    children.delete(index, 1)
    if (insertAt > index) insertAt -= 1
    children.insert(insertAt, [buildYNode(plain)])
  })
}

export function updateFrameProps(doc: Y.Doc, id: string, patch: Partial<FrameProps>) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, id)
  if (!node || node.get('kind') !== 'frame') return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      node.set(key, value)
    }
    // A manual background edit permanently opts this frame out of following
    // theme changes -- otherwise the next paste would silently overwrite it.
    if ('background' in patch) node.set('backgroundAuto', false)
    // Switching an already-populated frame into canvas mode: any child still
    // missing x/y (created while this frame was still in flex mode) would
    // otherwise all render at (0,0), fully overlapping -- assign each a
    // distinct cascading position, the same one addBlock/addFrame already
    // give brand-new canvas-mode children.
    if (patch.childLayout === 'canvas') {
      const children = node.get('children') as Y.Array<Y.Map<unknown>> | undefined
      if (children) {
        children.toArray().forEach((child, index) => {
          if (child.get('x') == null || child.get('y') == null) {
            const offset = cascadeOffset(index)
            child.set('x', offset)
            child.set('y', offset)
          }
        })
      }
    }
  })
}

export function updateCodeProps(doc: Y.Doc, id: string, patch: Partial<CodeBlockProps>) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, id)
  if (!node || node.get('kind') !== 'code') return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      node.set(key, value)
    }
  })
}

export type GutterClickMode = 'highlight' | 'diff' | 'trim'

/** Clicking a gutter line number cycles that line's state for whichever
 * mode is currently selected (see the Inspector's "Gutter click sets"
 * control) -- one shared interaction primitive reused three ways. Highlight
 * and trim are plain in/out toggles; diff cycles none -> add -> remove ->
 * none, since a line can be in one of three diff states, not two. */
export function cycleGutterLine(doc: Y.Doc, blockId: string, lineNumber: number, mode: GutterClickMode) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, blockId)
  if (!node || node.get('kind') !== 'code') return
  doc.transact(() => {
    if (mode === 'highlight') {
      const current = (node.get('highlightLines') as Array<[number, number]> | undefined) ?? []
      node.set('highlightLines', toggleLine(current, lineNumber))
    } else if (mode === 'trim') {
      const current = (node.get('trimRanges') as Array<[number, number]> | undefined) ?? []
      node.set('trimRanges', toggleLine(current, lineNumber))
    } else {
      const current = (node.get('diffLines') as Record<number, 'add' | 'remove'> | undefined) ?? {}
      const next = { ...current }
      if (next[lineNumber] === undefined) next[lineNumber] = 'add'
      else if (next[lineNumber] === 'add') next[lineNumber] = 'remove'
      else delete next[lineNumber]
      node.set('diffLines', next)
    }
  })
}

export function updateImageProps(doc: Y.Doc, id: string, patch: Partial<ImageBlockProps>) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, id)
  if (!node || node.get('kind') !== 'image') return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      node.set(key, value)
    }
  })
}

/** Called on every paste/theme change -- updates the root's background to
 * match as long as `backgroundAuto` is still true (i.e. the user hasn't
 * manually picked a background color for it). Unlike a one-time "only if
 * null" check, this keeps the card in sync on every subsequent change too. */
export function setRootBackgroundIfAuto(doc: Y.Doc, color: string) {
  const root = ensureRootFrame(doc)
  if (root.get('backgroundAuto') !== false) {
    doc.transact(() => root.set('background', color))
  }
}

/** Re-enables auto-follow for a frame's background (the Inspector's "Auto"
 * reset) -- does not immediately change the color, just lets the next
 * paste/theme change take over again. */
export function setBackgroundAuto(doc: Y.Doc, id: string, auto: boolean) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, id)
  if (!node || node.get('kind') !== 'frame') return
  doc.transact(() => node.set('backgroundAuto', auto))
}

/** Explicit size override via resize handles -- works on any node kind.
 * Passing null for a dimension resets it to "size to content". */
export function updateNodeSize(doc: Y.Doc, id: string, size: { width?: number | null; height?: number | null }) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, id)
  if (!node) return
  doc.transact(() => {
    if ('width' in size) node.set('width', size.width ?? null)
    if ('height' in size) node.set('height', size.height ?? null)
  })
}

/** Explicit position, only meaningful while the node's parent frame has
 * childLayout: 'canvas' -- works on any node kind, mirrors updateNodeSize. */
export function updateNodePosition(doc: Y.Doc, id: string, position: { x: number; y: number }) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, id)
  if (!node) return
  doc.transact(() => {
    node.set('x', position.x)
    node.set('y', position.y)
  })
}

/**
 * Wraps N sibling nodes (must share the same parent) into a new canvas-mode
 * child frame, positioned at their bounding box's top-left, each child's x/y
 * rewritten relative to that new origin -- so moving/resizing the group
 * frame moves everything inside it for free. Only meaningful for children of
 * a canvas-mode parent (siblings without x/y have nothing to preserve).
 * No-ops if fewer than 2 ids resolve to siblings under the same parent.
 */
export function groupNodes(doc: Y.Doc, ids: string[]): string | null {
  if (ids.length < 2) return null
  const root = ensureRootFrame(doc)
  const infos = ids.map((id) => findParentInfo(root, id)).filter((i): i is ParentInfo => i !== null)
  if (infos.length !== ids.length) return null
  const { children } = infos[0]
  if (!infos.every((i) => i.children === children)) return null

  const plainNodes = infos
    .map((i) => i.children.get(i.index).toJSON() as LayoutNode)
    .filter((n) => n.x != null && n.y != null)
  if (plainNodes.length !== ids.length) return null

  const minX = Math.min(...plainNodes.map((n) => n.x as number))
  const minY = Math.min(...plainNodes.map((n) => n.y as number))
  const groupId = crypto.randomUUID()
  const groupPlain: LayoutNode = {
    id: groupId,
    kind: 'frame',
    x: minX,
    y: minY,
    ...DEFAULT_FRAME_PROPS,
    childLayout: 'canvas',
    children: plainNodes.map((n) => ({ ...n, x: (n.x as number) - minX, y: (n.y as number) - minY })),
  }
  const groupMap = buildYNode(groupPlain)

  doc.transact(() => {
    // Delete highest index first so earlier indices stay valid mid-loop.
    const sortedIndices = infos.map((i) => i.index).sort((a, b) => b - a)
    for (const index of sortedIndices) children.delete(index, 1)
    children.push([groupMap])
  })
  return groupId
}

/** Reverses groupNodes: unwraps a group frame's children back into its
 * parent, each child's x/y rewritten back to the parent's coordinate space. */
export function ungroupNode(doc: Y.Doc, groupId: string) {
  if (groupId === ROOT_ID) return
  const root = ensureRootFrame(doc)
  const info = findParentInfo(root, groupId)
  if (!info) return
  const groupNode = info.children.get(info.index)
  if (groupNode.get('kind') !== 'frame') return
  const groupPlain = groupNode.toJSON() as LayoutNode
  const originX = groupPlain.x ?? 0
  const originY = groupPlain.y ?? 0
  const restoredChildren = (groupPlain.children ?? []).map((child) => ({
    ...child,
    x: child.x != null ? child.x + originX : child.x,
    y: child.y != null ? child.y + originY : child.y,
  }))

  doc.transact(() => {
    info.children.delete(info.index, 1)
    info.children.insert(info.index, restoredChildren.map(buildYNode))
  })
}

// Callouts are stored as a plain JSON array value on the owning frame (see
// setFrameFields) rather than a nested Y.Array/Y.Map tree -- small,
// infrequently-changed lists that don't need field-level collaborative
// merging, only whole-list read/replace. Both Inspector (the "+ Callout"
// action) and the Callout component (drag-to-reposition, text edits) call
// these directly, the same way Inspector already calls updateFrameProps/
// updateCodeProps directly rather than going through page-level callbacks.

export function addCallout(doc: Y.Doc, frameId: string): string | null {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, frameId)
  if (!node || node.get('kind') !== 'frame') return null
  const id = crypto.randomUUID()
  const callout: CalloutAnnotation = { id, targetId: null, dx: 40, dy: 40, text: '' }
  doc.transact(() => {
    const existing = (node.get('callouts') as CalloutAnnotation[] | undefined) ?? []
    node.set('callouts', [...existing, callout])
  })
  return id
}

export function updateCallout(doc: Y.Doc, frameId: string, calloutId: string, patch: Partial<CalloutAnnotation>) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, frameId)
  if (!node || node.get('kind') !== 'frame') return
  doc.transact(() => {
    const existing = (node.get('callouts') as CalloutAnnotation[] | undefined) ?? []
    node.set(
      'callouts',
      existing.map((c) => (c.id === calloutId ? { ...c, ...patch } : c))
    )
  })
}

export function removeCallout(doc: Y.Doc, frameId: string, calloutId: string) {
  const root = ensureRootFrame(doc)
  const node = findNodeMap(root, frameId)
  if (!node || node.get('kind') !== 'frame') return
  doc.transact(() => {
    const existing = (node.get('callouts') as CalloutAnnotation[] | undefined) ?? []
    node.set(
      'callouts',
      existing.filter((c) => c.id !== calloutId)
    )
  })
}
