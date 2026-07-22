import { DEFAULT_LANGUAGE, DEFAULT_THEME, DEFAULT_FONT_KEY } from '@/lib/presets'

export type FlexDirection = 'row' | 'column'
export type FlexAlign = 'flex-start' | 'center' | 'flex-end' | 'stretch'
export type FlexJustify = 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'

// Whether a frame's direct children flow via the flex properties below
// (default, unchanged behavior) or are freely positioned via their own
// explicit x/y -- see lib/layout/frame-style.ts and components/canvas/frame-node.tsx.
export type ChildLayout = 'flex' | 'canvas'

// A small floating arrow+caption anchored near a point or a sibling's edge.
// Lives on the frame that owns the canvas area it's drawn over, not as its
// own LayoutNode -- it has no children/content of its own beyond a caption.
export interface CalloutAnnotation {
  id: string
  // Node this callout points at, if any -- the arrow is drawn from (dx, dy)
  // toward that node's nearest edge. Null means a free-floating callout with
  // no arrow target.
  targetId: string | null
  dx: number
  dy: number
  text: string
}

// Only meaningful on a page's root frame -- the exported PDF page this
// document's content sits on. 'content' (default) matches every prior
// export: an exact-content-size page with no margin. The others put that
// same content onto a fixed-size page instead of resizing it to fill one
// (see app/api/export/route.ts).
export type PageSize = 'content' | 'a4' | 'letter' | 'custom'

export interface FrameProps {
  direction: FlexDirection
  gap: number
  padding: number
  align: FlexAlign
  justify: FlexJustify
  background: string | null
  // Whether `background` should keep following the latest pasted theme's
  // color. Set to false the moment a user manually edits it in the
  // Inspector, so a later theme change never silently overwrites their
  // choice -- see setRootBackgroundIfAuto in lib/yjs/layout-store.ts.
  backgroundAuto: boolean
  radius: number
  childLayout: ChildLayout
  callouts: CalloutAnnotation[]
  pageSize: PageSize
  customPageWidthMm: number
  customPageHeightMm: number
}

export type LayoutNodeKind = 'frame' | 'code' | 'text' | 'image'

// Window chrome around a code block: traffic-light dots, a VS Code-style
// tab, a plain terminal bar, or none at all. Replaces the old boolean
// showChrome outright (local-only data, no migration system to preserve).
export type ChromeStyle = 'mac' | 'vscode-tab' | 'terminal' | 'none'

/**
 * Plain, JSON-serializable tree shape -- what you get back from
 * rootMap.toJSON() (see lib/yjs/layout-store.ts). Not the Yjs types
 * themselves, which is what mutation helpers operate on directly.
 */
export interface LayoutNode {
  id: string
  kind: LayoutNodeKind
  // any kind -- explicit size override via resize handles; null/undefined
  // means "size to content" (the default, flex-driven behavior).
  width?: number | null
  height?: number | null
  // any kind -- explicit position, only meaningful when the PARENT frame has
  // childLayout: 'canvas'. Null/undefined means "not yet positioned" (the
  // node is assigned an initial x/y the moment its parent switches modes).
  x?: number | null
  y?: number | null
  // frame-only
  direction?: FlexDirection
  gap?: number
  padding?: number
  align?: FlexAlign
  justify?: FlexJustify
  background?: string | null
  backgroundAuto?: boolean
  radius?: number
  childLayout?: ChildLayout
  callouts?: CalloutAnnotation[]
  pageSize?: PageSize
  customPageWidthMm?: number
  customPageHeightMm?: number
  children?: LayoutNode[]
  // code-only
  language?: string
  theme?: string
  fontFamily?: string
  filename?: string
  chromeStyle?: ChromeStyle
  showLineNumbers?: boolean
  startLineNumber?: number
  ligatures?: boolean
  lineHeight?: number
  letterSpacing?: number
  // Each tuple is an inclusive 1-based [start, end] line range.
  highlightLines?: Array<[number, number]>
  trimRanges?: Array<[number, number]>
  // 1-based line number -> diff marker for that line.
  diffLines?: Record<number, 'add' | 'remove'>
  // image-only
  src?: string
  alt?: string
}

export interface CodeBlockProps {
  language: string
  theme: string
  fontFamily: string
  filename: string
  chromeStyle: ChromeStyle
  showLineNumbers: boolean
  startLineNumber: number
  ligatures: boolean
  lineHeight: number
  letterSpacing: number
  highlightLines: Array<[number, number]>
  trimRanges: Array<[number, number]>
  diffLines: Record<number, 'add' | 'remove'>
}

export const DEFAULT_CODE_BLOCK_PROPS: CodeBlockProps = {
  language: DEFAULT_LANGUAGE,
  theme: DEFAULT_THEME,
  fontFamily: DEFAULT_FONT_KEY,
  filename: '',
  chromeStyle: 'none',
  showLineNumbers: false,
  startLineNumber: 1,
  ligatures: true,
  lineHeight: 1.65,
  letterSpacing: 0,
  highlightLines: [],
  trimRanges: [],
  diffLines: {},
}

export interface ImageBlockProps {
  src: string
  alt: string
}

export const DEFAULT_IMAGE_BLOCK_PROPS: ImageBlockProps = {
  src: '',
  alt: '',
}

export const DEFAULT_FRAME_PROPS: FrameProps = {
  direction: 'column',
  gap: 16,
  // A nested frame with zero padding puts its own hover controls at almost
  // the same absolute position as its child's, making the frame's controls
  // unclickable (the child's, painted later, wins). A small default gives
  // both their own space; users can still set 0 explicitly via the Inspector.
  padding: 8,
  align: 'flex-start',
  justify: 'flex-start',
  background: null,
  backgroundAuto: true,
  radius: 0,
  childLayout: 'flex',
  callouts: [],
  pageSize: 'content',
  customPageWidthMm: 210,
  customPageHeightMm: 297,
}

export const DEFAULT_ROOT_FRAME_PROPS: FrameProps = {
  direction: 'column',
  gap: 16,
  padding: 28,
  align: 'flex-start',
  justify: 'flex-start',
  background: null, // auto-filled from the latest pasted theme's bg -- see setRootBackgroundIfAuto
  backgroundAuto: true,
  radius: 12,
  childLayout: 'flex',
  callouts: [],
  pageSize: 'content',
  customPageWidthMm: 210,
  customPageHeightMm: 297,
}
