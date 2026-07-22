/** Shared helpers for the 1-based inclusive [start, end] line-range tuples
 * used by highlightLines/trimRanges (see lib/layout/types.ts) -- both are
 * "toggle one line in/out of a set of ranges" under the hood, driven by
 * clicking a gutter line number (see cycleGutterLine in lib/yjs/layout-store.ts). */

export function rangesToSet(ranges: Array<[number, number]>): Set<number> {
  const set = new Set<number>()
  for (const [start, end] of ranges) {
    for (let i = start; i <= end; i++) set.add(i)
  }
  return set
}

export function setToRanges(set: Set<number>): Array<[number, number]> {
  const sorted = [...set].sort((a, b) => a - b)
  const ranges: Array<[number, number]> = []
  for (const n of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && n === last[1] + 1) {
      last[1] = n
    } else {
      ranges.push([n, n])
    }
  }
  return ranges
}

export function toggleLine(ranges: Array<[number, number]>, lineNumber: number): Array<[number, number]> {
  const set = rangesToSet(ranges)
  if (set.has(lineNumber)) set.delete(lineNumber)
  else set.add(lineNumber)
  return setToRanges(set)
}
