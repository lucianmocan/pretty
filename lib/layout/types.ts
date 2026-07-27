import { DEFAULT_LANGUAGE, DEFAULT_THEME, DEFAULT_FONT_KEY, THEME_PREVIEWS } from '@/lib/presets'

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
  // Kept for backwards compatibility with documents created when syntax
  // themes also controlled the canvas background. New documents never use
  // that coupling; ensureRootFrame clears the old auto-derived value.
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
// tab, a plain terminal bar, a user-designed custom one, or none at all.
// Replaces the old boolean showChrome outright (local-only data, no
// migration system to preserve).
export type ChromeStyle = 'mac' | 'vscode-tab' | 'terminal' | 'custom' | 'none'

// A small fixed icon set a custom chrome bar can show -- resolved to an
// actual lucide-react component in components/editor/code-chrome.tsx (the
// only consumer), never stored as a component reference itself since this
// whole object round-trips through JSON (the Yjs doc, localStorage).
export type ChromeIconKey = 'none' | 'file-code' | 'terminal' | 'folder' | 'code' | 'braces'

// A user-designed window chrome bar. Stored WHOLE on the code block that
// uses it (CodeBlockProps.customChrome below) -- not just a ref to a saved
// library entry by id -- so the print/export route's fresh, localStorage-
// less browser context can still render it exactly like the live editor
// does. lib/presets/custom-chrome-styles.ts's localStorage CRUD is only a
// reusable "library" a user picks from and copies out of (same pattern as
// lib/presets/style-presets.ts), not the live source of truth for a block
// that's already using one.
export interface CustomChromeStyle {
  id: string
  name: string
  barBackground: string
  barBorderColor: string
  textColor: string
  // null = no traffic-light-style dots row at all.
  dotColors: [string, string, string] | null
  icon: ChromeIconKey
  filenamePosition: 'inline' | 'tab'
  radius: number
}

/**
 * Plain, JSON-serializable tree shape -- what you get back from
 * rootMap.toJSON() (see lib/yjs/layout-store.ts). Not the Yjs types
 * themselves, which is what mutation helpers operate on directly.
 */
export interface LayoutNode {
  id: string
  kind: LayoutNodeKind
  // Optional user-facing name shown in the Layers panel. Older documents
  // omit it and use a content-aware fallback label.
  label?: string
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
  themeBackground?: string
  themeLineNumberForeground?: string
  fontFamily?: string
  filename?: string
  chromeStyle?: ChromeStyle
  customChrome?: CustomChromeStyle
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
  themeBackground: string
  themeLineNumberForeground: string
  fontFamily: string
  filename: string
  chromeStyle: ChromeStyle
  customChrome?: CustomChromeStyle
  showLineNumbers: boolean
  startLineNumber: number
  ligatures: boolean
  lineHeight: number
  letterSpacing: number
  highlightLines: Array<[number, number]>
  trimRanges: Array<[number, number]>
  diffLines: Record<number, 'add' | 'remove'>
}

/* Real authored dimensions for newly created surfaces. Unlike the visual
   auto-size floors in globals.css, the code-block values are persisted on a
   new node so selection geometry and the Inspector never report 0 × 0. */
export const DEFAULT_CANVAS_WIDTH = 1200
export const DEFAULT_CANVAS_HEIGHT = 800
export const DEFAULT_CODE_BLOCK_WIDTH = 640
export const DEFAULT_CODE_BLOCK_HEIGHT = 360

export const DEFAULT_CODE_BLOCK_PROPS: CodeBlockProps = {
  language: DEFAULT_LANGUAGE,
  theme: DEFAULT_THEME,
  themeBackground: THEME_PREVIEWS[DEFAULT_THEME].bg,
  themeLineNumberForeground: THEME_PREVIEWS[DEFAULT_THEME].lineNumber,
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
  backgroundAuto: false,
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
  background: null,
  backgroundAuto: false,
  radius: 12,
  // New documents default to Free-form (canvas-mode) -- freely positioning
  // blocks is this app's main differentiator, so a brand new document
  // should land there instead of Flex, which was really just the technical
  // default before Free-form existed.
  childLayout: 'canvas',
  callouts: [],
  pageSize: 'content',
  customPageWidthMm: 210,
  customPageHeightMm: 297,
}
