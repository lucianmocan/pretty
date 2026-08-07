const GRID_SIZE = 8
const SNAP_THRESHOLD = 6

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface SnapResult {
  x: number
  y: number
  // Parent-local coordinates of any guide lines to draw for the duration of
  // the drag -- one axis position per matched alignment.
  guides: { x: number[]; y: number[] }
}

interface SnapCandidate {
  position: number
  guide: number
  distance: number
}

function equalGapCandidates(
  draggedSize: number,
  siblings: Array<[start: number, size: number]>
): Array<{ position: number; guide: number }> {
  const sorted = [...siblings].sort((a, b) => a[0] - b[0])
  const candidates: Array<{ position: number; guide: number }> = []
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const [firstStart, firstSize] = sorted[index]
    const [secondStart, secondSize] = sorted[index + 1]
    const firstEnd = firstStart + firstSize
    const secondEnd = secondStart + secondSize
    const gap = secondStart - firstEnd
    if (gap < 0) continue

    // Continue an existing equal gap before or after a sibling pair.
    const after = secondEnd + gap
    const before = firstStart - gap - draggedSize
    candidates.push({ position: after, guide: secondEnd })
    candidates.push({ position: before, guide: firstStart })

    // Center the dragged box in an existing opening, producing equal gaps
    // on both sides. Duplicate candidates retain both boundary guides.
    if (secondStart - firstEnd >= draggedSize) {
      const between = (firstEnd + secondStart - draggedSize) / 2
      candidates.push({ position: between, guide: firstEnd })
      candidates.push({ position: between, guide: secondStart })
    }
  }
  return candidates
}

function nearestAlignment(
  draggedStart: number,
  draggedSize: number,
  siblingStartsAndSizes: Array<[start: number, size: number]>,
  threshold: number,
  fixedCandidates: Array<{ position: number; guide: number }> = []
): { position: number; guides: number[] } | null {
  const draggedOffsets = [0, draggedSize / 2, draggedSize]
  // Fixed candidates come first so a parent-center alignment wins an exact
  // distance tie with a sibling. That makes the artboard's primary axes feel
  // stable instead of changing based on sibling DOM order.
  const candidates: SnapCandidate[] = fixedCandidates.map(({ position, guide }) => ({
    position,
    guide,
    distance: Math.abs(position - draggedStart),
  }))

  for (const [siblingStart, siblingSize] of siblingStartsAndSizes) {
    const siblingEdges = [siblingStart, siblingStart + siblingSize / 2, siblingStart + siblingSize]
    for (const draggedOffset of draggedOffsets) {
      for (const guide of siblingEdges) {
        const position = guide - draggedOffset
        candidates.push({
          position,
          guide,
          distance: Math.abs(position - draggedStart),
        })
      }
    }
  }

  const nearest = candidates.reduce<SnapCandidate | null>(
    (best, candidate) => (!best || candidate.distance < best.distance ? candidate : best),
    null
  )
  if (!nearest || nearest.distance > threshold) return null

  // Equal-sized boxes often align on two or three edges at once. Preserve
  // every guide belonging to the winning position, but never show guides
  // from other nearby candidates that did not actually determine the snap.
  const guides = Array.from(
    new Set(
      candidates
        .filter((candidate) => Math.abs(candidate.position - nearest.position) < 0.001)
        .map((candidate) => candidate.guide)
    )
  )
  return { position: nearest.position, guides }
}

/**
 * Snaps a dragged box's position to the nearest grid line, then to sibling
 * edges/centers or the parent frame's center axes if within a small threshold
 * (an alignment match wins over plain grid snapping) -- the same "smart
 * guides" technique design tools use, scoped down to axis-aligned comparisons.
 *
 * When `containerSize` is given, it also seeds a center-alignment candidate
 * (the box's x/y snaps to the container's own horizontal/vertical center,
 * same as it would to a sibling's center) -- it does not clamp the result.
 * Canvas content is allowed to be dragged past the container's edges; the
 * frame's own `overflow: hidden` (see frameInnerStyle in frame-style.ts)
 * clips anything that ends up outside, so it's a visual clip, not a hard
 * boundary on where a block can be positioned.
 *
 * `snapThreshold` is expressed in the same parent-local coordinate system as
 * the boxes. The caller divides the desired screen-pixel threshold by canvas
 * zoom, keeping the interaction equally forgiving at every zoom level.
 */
export function snapPosition(
  dragged: Box,
  siblings: Box[],
  containerSize?: { width: number; height: number },
  snapThreshold = SNAP_THRESHOLD
): SnapResult {
  let x = Math.round(dragged.x / GRID_SIZE) * GRID_SIZE
  let y = Math.round(dragged.y / GRID_SIZE) * GRID_SIZE
  let guideX: number[] = []
  let guideY: number[] = []

  const xAlignment = nearestAlignment(
    dragged.x,
    dragged.width,
    siblings.map((sibling): [number, number] => [sibling.x, sibling.width]),
    snapThreshold,
    [
      ...(containerSize
        ? [{ position: (containerSize.width - dragged.width) / 2, guide: containerSize.width / 2 }]
        : []),
      ...equalGapCandidates(
        dragged.width,
        siblings.map((sibling): [number, number] => [sibling.x, sibling.width])
      ),
    ]
  )
  const yAlignment = nearestAlignment(
    dragged.y,
    dragged.height,
    siblings.map((sibling): [number, number] => [sibling.y, sibling.height]),
    snapThreshold,
    [
      ...(containerSize
        ? [{ position: (containerSize.height - dragged.height) / 2, guide: containerSize.height / 2 }]
        : []),
      ...equalGapCandidates(
        dragged.height,
        siblings.map((sibling): [number, number] => [sibling.y, sibling.height])
      ),
    ]
  )
  if (xAlignment) {
    x = xAlignment.position
    guideX = xAlignment.guides
  }
  if (yAlignment) {
    y = yAlignment.position
    guideY = yAlignment.guides
  }

  return { x, y, guides: { x: guideX, y: guideY } }
}
