import assert from 'node:assert/strict'
import test from 'node:test'
import { planFlexToCanvasPositions } from '../lib/layout/layout-transition.ts'

test('flex to canvas preserves measured child positions', () => {
  const positions = planFlexToCanvasPositions(
    'frame',
    [
      { id: 'a', x: null, y: null },
      { id: 'b', x: 400, y: 500 },
    ],
    {
      a: { id: 'a', parentId: 'frame', x: 28.2, y: 28, width: 180, height: 90 },
      b: { id: 'b', parentId: 'frame', x: 224.7, y: 28, width: 180, height: 90 },
    }
  )

  assert.deepEqual(positions, {
    a: { x: 28, y: 28 },
    b: { x: 225, y: 28 },
  })
})

test('flex to canvas ignores geometry measured under another parent', () => {
  const positions = planFlexToCanvasPositions(
    'frame',
    [
      { id: 'a', x: 12, y: 18 },
      { id: 'b', x: null, y: null },
    ],
    {
      a: { id: 'a', parentId: 'other-frame', x: 90, y: 90, width: 20, height: 20 },
    }
  )

  assert.deepEqual(positions, {
    a: { x: 12, y: 18 },
    b: { x: 40, y: 24 },
  })
})
