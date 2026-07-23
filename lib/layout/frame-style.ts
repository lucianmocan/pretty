import type { CSSProperties } from 'react'
import type { LayoutNode } from './types'

/**
 * Pure data -> CSS mapping, the single source of truth for how a frame's
 * stored props become flexbox styling. Called identically by the live
 * interactive canvas (components/canvas/frame-node.tsx) and the print route,
 * so the two structures can never visually diverge. The root frame's shadow
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
    style.overflow = 'auto'
  }
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
    borderRadius: node.radius ?? 0,
    ...sizeStyle(node),
  }
}

/**
 * Editor-only split of sizeStyle()/frameStyle() into an OUTER, position-
 * hosting box vs an INNER content wrapper that owns scroll/clip. The print
 * route keeps using the unified sizeStyle()/frameStyle() above unchanged --
 * it has no floating chrome to protect, so a single div is fine there and
 * the split would just be needless divergence risk.
 *
 * The live editor (components/canvas/frame-node.tsx) DOES have floating
 * chrome deliberately positioned outside a node's own box (NodeControls,
 * ResizeHandles) -- once a node gets an explicit height, sizeStyle()'s
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

/** height:'100%' fills the outer box's own explicit height exactly (a plain
 * block/flex child doesn't stretch to fill a parent's height by default,
 * unlike width) -- only meaningful once that outer height is actually set. */
export function contentOverflowStyle(node: LayoutNode): CSSProperties {
  return node.height != null ? { height: '100%', overflow: 'auto' } : {}
}

export function frameOuterStyle(node: LayoutNode): CSSProperties {
  return {
    background: node.background ?? undefined,
    borderRadius: node.radius ?? 0,
    ...outerBoxStyle(node),
  }
}

export function frameInnerStyle(node: LayoutNode): CSSProperties {
  const base: CSSProperties = {
    display: 'flex',
    flexDirection: node.direction ?? 'column',
    gap: node.gap ?? 0,
    padding: node.padding ?? 0,
    alignItems: node.align ?? 'flex-start',
    justifyContent: node.justify ?? 'flex-start',
  }
  // Canvas-mode children are absolutely positioned relative to THIS
  // wrapper, and frame-node.tsx's beginMoveDrag/ResizeHandles measure it
  // (via elementRef.parentElement) to clamp drag bounds -- both need it to
  // reliably fill the OUTER box's actual rendered size, not just its own
  // content. `height: 100%` doesn't do that reliably: per the CSS spec, a
  // percentage height only resolves against an ancestor's own EXPLICIT
  // `height`, not one merely clamped upward by `min-height` -- exactly the
  // case for an un-resized canvas-mode frame, which relies entirely on
  // .scripture-frame-canvas's CSS min-height floor. `position: absolute;
  // inset: 0` fills the outer box's actual used size regardless of which
  // of those established it (explicit resize or the CSS floor).
  //
  // The one case that must stay in NORMAL FLOW instead: a flex-mode frame
  // with no explicit height, where the outer box's own auto-height is
  // genuinely meant to be driven BY this wrapper's content -- an
  // absolutely-positioned (out-of-flow) wrapper could no longer do that.
  if (node.height != null || node.childLayout === 'canvas') {
    return { ...base, position: 'absolute', inset: 0, overflow: node.height != null ? 'auto' : undefined }
  }
  return base
}
