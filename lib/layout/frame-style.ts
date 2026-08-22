import type { CSSProperties } from 'react'
import type { LayoutNode } from './types'

/** Default authored text uses currentColor. When a user gives a frame an
 * explicit background, provide a readable inherited foreground for that
 * default without touching any explicitly formatted text color. Null canvas
 * backgrounds continue to use the app's light/dark foreground token. */
function foregroundForBackground(background: string | null | undefined): string | undefined {
  if (!background) return undefined
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(background)
  if (!match) return undefined
  const channels = match.slice(1).map((channel) => Number.parseInt(channel, 16) / 255)
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return luminance > 0.179 ? '#111111' : '#ffffff'
}

/**
 * Pure data -> CSS mapping, the single source of truth for how a frame's
 * stored props become flexbox styling. The split outer/inner helpers below
 * are called identically by the live canvas and the static export renderer,
 * so both use the same sizing and positioning boxes. The root frame's base
 * treatment is a separate `.scripture-card` class the caller applies -- not
 * part of this data-driven style, since it's fixed chrome, not a stored prop.
 */
/** Explicit size override from resize handles -- shared by frames and leaf
 * blocks alike, since either can be resized. null/undefined means "size to
 * content" (the default, flex-driven behavior). */
export function sizeStyle(node: LayoutNode): CSSProperties {
  const style: CSSProperties = {}
  if (node.width != null) {
    style.width = `${node.width}px`
    style.flexShrink = 0
  }
  if (node.height != null) {
    style.height = `${node.height}px`
  }
  if (node.width != null || node.height != null) style.overflow = 'auto'
  return style
}

export function frameStyle(node: LayoutNode): CSSProperties {
  return {
    display: 'flex',
    flexDirection: node.direction ?? 'column',
    gap: node.gap ?? 0,
    padding: node.padding ?? 0,
    alignItems: node.align ?? 'flex-start',
    justifyContent: node.justify ?? 'flex-start',
    background: node.background ?? undefined,
    color: foregroundForBackground(node.background),
    borderRadius: node.radius ?? 0,
    ...sizeStyle(node),
  }
}

/**
 * Split sizeStyle()/frameStyle() into an OUTER, position-hosting box vs an
 * INNER content wrapper that owns scroll/clip. The static export renderer
 * mirrors this split because canvas-mode children must be positioned from
 * the padded inner wrapper, exactly as they are in the live editor.
 *
 * The live editor (components/canvas/frame-node.tsx) DOES have floating
 * chrome deliberately positioned outside a node's own box (NodeControls,
 * ResizeHandles) -- once a node gets an explicit size, sizeStyle()'s
 * `overflow: auto` would silently clip that chrome the moment it extends
 * past the box, with no visual sign why (found via a real repro: resize a
 * block once, its hover controls become permanently unclickable/invisible
 * even though their own CSS still says opacity: 1). Moving scroll/clip
 * behavior onto a same-sized INNER wrapper -- instead of the outer box that
 * hosts the floating chrome -- fixes this at the root instead of chasing it
 * per-component.
 */
export function outerBoxStyle(node: LayoutNode): CSSProperties {
  const style: CSSProperties = {}
  if (node.width != null) {
    style.width = `${node.width}px`
    style.flexShrink = 0
  }
  if (node.height != null) {
    style.height = `${node.height}px`
  }
  return style
}

export type OverflowBehavior = 'scroll' | 'clip'

/** Keeps resized content inside the outer geometry box. Width-only resizing
 * needs overflow just as much as height-only resizing does: a long `pre`
 * line otherwise paints through the right edge with no scrollbar or fade.
 * Interactive nodes remain scrollable; static export copies clip at the
 * authored bounds so browser scrollbar chrome is not captured in PNG/PDF. */
export function contentOverflowStyle(
  node: LayoutNode,
  overflowBehavior: OverflowBehavior = 'scroll'
): CSSProperties {
  if (node.width == null && node.height == null) return {}
  return {
    ...(node.width != null && { width: '100%', minWidth: 0 }),
    ...(node.height != null && { height: '100%', minHeight: 0 }),
    overflow: overflowBehavior === 'scroll' ? 'auto' : 'hidden',
  }
}

export function frameOuterStyle(node: LayoutNode): CSSProperties {
  return {
    background: node.background ?? undefined,
    color: foregroundForBackground(node.background),
    borderRadius: node.radius ?? 0,
    ...outerBoxStyle(node),
  }
}

export function frameInnerStyle(
  node: LayoutNode,
  overflowBehavior: OverflowBehavior = 'scroll'
): CSSProperties {
  const isCanvas = node.childLayout === 'canvas'
  const base: CSSProperties = {
    display: 'flex',
    flexDirection: node.direction ?? 'column',
    gap: node.gap ?? 0,
    padding: node.padding ?? 0,
    alignItems: node.align ?? 'flex-start',
    justifyContent: node.justify ?? 'flex-start',
    // Canvas children are absolute relative to this content viewport. Keeping
    // the wrapper in normal flow preserves a frame's intrinsic width when
    // only its height is explicit; an absolute `inset: 0` wrapper made such
    // frames collapse horizontally because it contributed no intrinsic size.
    position: isCanvas ? 'relative' : undefined,
    // Canvas children can be freely dragged past the frame's own bounds --
    // clip them at the frame edge instead of scrolling, regardless of
    // whether the frame has an explicit size.
    ...(isCanvas && { overflow: 'hidden' }),
  }
  if (node.width == null && node.height == null) return base
  return {
    ...base,
    ...(node.width != null && { width: '100%', minWidth: 0 }),
    ...(node.height != null && { height: '100%', minHeight: 0 }),
    overflow: isCanvas || overflowBehavior === 'clip' ? 'hidden' : 'auto',
  }
}
