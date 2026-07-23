import { useEffect, useState, type RefObject } from 'react'

export interface OverflowFadeState {
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}

const NONE: OverflowFadeState = { top: false, bottom: false, left: false, right: false }

/**
 * Tracks which edges of a scrollable element currently have content hidden
 * past them -- used to show a fade indicator so a block that's been resized
 * smaller than its own content doesn't silently hide the rest with no visual
 * sign anything's missing. A 1px tolerance absorbs sub-pixel layout jitter
 * that would otherwise flicker the indicator on/off at the exact scroll end.
 *
 * Reacts to three distinct kinds of change, none of which alone would catch
 * every case: scrolling (the `scroll` listener), the element's OWN box
 * resizing (ResizeObserver -- e.g. dragging the block's resize handles), and
 * the element's CONTENT growing/shrinking while its own box stays fixed
 * (MutationObserver -- e.g. typing more lines into a height-constrained code
 * block never changes the wrapper's own size, only its scrollHeight).
 */
export function useOverflowFade(ref: RefObject<HTMLElement | null>, enabled: boolean): OverflowFadeState {
  const [state, setState] = useState<OverflowFadeState>(NONE)

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const update = () => {
      const overflowY = el.scrollHeight > el.clientHeight + 1
      const overflowX = el.scrollWidth > el.clientWidth + 1
      setState({
        top: overflowY && el.scrollTop > 1,
        bottom: overflowY && el.scrollTop < el.scrollHeight - el.clientHeight - 1,
        left: overflowX && el.scrollLeft > 1,
        right: overflowX && el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
      })
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)
    const mutationObserver = new MutationObserver(update)
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })

    return () => {
      el.removeEventListener('scroll', update)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [ref, enabled])

  // Masked here rather than reset via a synchronous setState call inside the
  // effect above when `enabled` flips false -- state may be stale in that
  // case, but the caller never sees it.
  return enabled ? state : NONE
}
