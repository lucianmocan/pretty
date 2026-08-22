const OVERFLOW_TOLERANCE = 1

export function calculateCanvasCentering({
  renderedWidth,
  renderedHeight,
  availableWidth,
  availableHeight,
}: {
  renderedWidth: number
  renderedHeight: number
  availableWidth: number
  availableHeight: number
}) {
  const horizontalOverflow = renderedWidth - availableWidth
  const verticalOverflow = renderedHeight - availableHeight
  const overflowsHorizontally = horizontalOverflow > OVERFLOW_TOLERANCE
  const overflowsVertically = verticalOverflow > OVERFLOW_TOLERANCE

  return {
    overflows: overflowsHorizontally || overflowsVertically,
    scrollLeft: overflowsHorizontally ? horizontalOverflow / 2 : 0,
    scrollTop: overflowsVertically ? verticalOverflow / 2 : 0,
  }
}
