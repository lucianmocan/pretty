import assert from 'node:assert/strict'
import test from 'node:test'
import { snapPosition } from '../lib/layout/canvas-snap.ts'

test('chooses the nearest sibling alignment instead of the last nearby match', () => {
  const result = snapPosition(
    { x: 104, y: 40, width: 20, height: 20 },
    [
      { x: 100, y: 100, width: 20, height: 20 },
      { x: 109, y: 200, width: 20, height: 20 },
    ]
  )

  assert.equal(result.x, 100)
  assert.deepEqual(result.guides.x, [100, 110, 120])
})

test('uses the supplied local threshold so snapping stays screen-pixel consistent across zoom', () => {
  const dragged = { x: 105, y: 40, width: 20, height: 20 }
  const siblings = [{ x: 100, y: 100, width: 20, height: 20 }]

  assert.equal(snapPosition(dragged, siblings, undefined, 6).x, 100)
  assert.equal(snapPosition(dragged, siblings, undefined, 3).x, 104)
})

test('does not display a sibling guide when a container boundary overrides that snap', () => {
  const result = snapPosition(
    { x: -3, y: 20, width: 20, height: 20 },
    [{ x: -2, y: 100, width: 20, height: 20 }],
    { width: 200, height: 200 }
  )

  assert.equal(result.x, 0)
  assert.deepEqual(result.guides.x, [])
})

test('snaps the dragged center to both parent frame center axes', () => {
  const result = snapPosition(
    { x: 146, y: 91, width: 100, height: 60 },
    [],
    { width: 400, height: 240 }
  )

  assert.deepEqual(result, {
    x: 150,
    y: 90,
    guides: { x: [200], y: [120] },
  })
})

test('prefers a closer sibling over the parent center axis', () => {
  const result = snapPosition(
    { x: 143, y: 20, width: 100, height: 40 },
    [{ x: 142, y: 100, width: 100, height: 40 }],
    { width: 400, height: 240 }
  )

  assert.equal(result.x, 142)
  assert.deepEqual(result.guides.x, [142, 192, 242])
})

test('snaps to continue an equal sibling gap', () => {
  const result = snapPosition(
    { x: 96, y: 200, width: 20, height: 20 },
    [
      { x: 20, y: 20, width: 20, height: 20 },
      { x: 60, y: 80, width: 20, height: 20 },
    ]
  )

  assert.equal(result.x, 100)
  assert.deepEqual(result.guides.x, [80])
})

test('snaps to equal gaps on both sides inside an opening', () => {
  const result = snapPosition(
    { x: 74, y: 200, width: 20, height: 20 },
    [
      { x: 20, y: 20, width: 20, height: 20 },
      { x: 120, y: 80, width: 20, height: 20 },
    ]
  )

  assert.equal(result.x, 70)
  assert.deepEqual(result.guides.x, [40, 120])
})
