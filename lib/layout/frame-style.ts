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
