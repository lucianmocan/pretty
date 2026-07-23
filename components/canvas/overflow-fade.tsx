'use client'

import type { OverflowFadeState } from '@/lib/use-overflow-fade'

/** Renders a subtle gradient along whichever edges of a resized block
 * currently hide content past them (see lib/use-overflow-fade.ts) --
 * pointer-events: none throughout so it never blocks scrolling/clicking the
 * content underneath. */
export function OverflowFade({ state }: { state: OverflowFadeState }) {
  return (
    <>
      {state.top && <div className="scripture-overflow-fade scripture-overflow-fade-top" />}
      {state.bottom && <div className="scripture-overflow-fade scripture-overflow-fade-bottom" />}
      {state.left && <div className="scripture-overflow-fade scripture-overflow-fade-left" />}
      {state.right && <div className="scripture-overflow-fade scripture-overflow-fade-right" />}
    </>
  )
}
