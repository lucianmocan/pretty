'use client'

import { useEffect, useRef, useState } from 'react'
import type { SyntaxPriority } from './token-types'

/** Treats blocks near the viewport as visible while leaving distant blocks
 * for the tokenizer's idle queue. Focus is promoted separately by editors. */
export function useSyntaxPriority(enabled: boolean) {
  const elementRef = useRef<HTMLDivElement>(null)
  // A newly mounted page is visible until the observer proves otherwise.
  // Starting it in the background queue made a page switch wait behind stale
  // thumbnail work for one observer turn.
  const [priority, setPriority] = useState<SyntaxPriority>('visible')

  useEffect(() => {
    if (!enabled) return
    const element = elementRef.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setPriority('visible'))
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setPriority(entry?.isIntersecting ? 'visible' : 'background'),
      { rootMargin: '300px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  return { elementRef, priority }
}
