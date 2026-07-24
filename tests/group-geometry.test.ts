import assert from 'node:assert/strict'
import test from 'node:test'
import { computeGroupBounds } from '../lib/layout/group-geometry.ts'

test('measured grouping creates tight bounds around auto-sized children', () => {
  const bounds = computeGroupBounds(['a', 'b'], {
    a: { id: 'a', parentId: 'root', x: 20, y: 35, width: 143, height: 61 },
    b: { id: 'b', parentId: 'root', x: 210, y: 18, width: 92, height: 140 },
  })

  assert.deepEqual(bounds, { x: 20, y: 18, width: 282, height: 140 })
})

test('measured grouping refuses incomplete geometry', () => {
  assert.equal(
    computeGroupBounds(['a', 'missing'], {
      a: { id: 'a', parentId: 'root', x: 0, y: 0, width: 10, height: 10 },
    }),
    null
  )
})

