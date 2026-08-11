import assert from 'node:assert/strict'
import test from 'node:test'
import { planNodeDuplicate } from '../lib/layout/duplicate-node.ts'
import type { LayoutNode } from '../lib/layout/types.ts'

function sequentialIds() {
  let next = 0
  return () => `new-${++next}`
}

test('duplicates a code block with a fresh id and canvas offset', () => {
  const source: LayoutNode = {
    id: 'code-1',
    kind: 'code',
    x: 20,
    y: 40,
    width: 300,
    language: 'typescript',
  }

  const result = planNodeDuplicate(source, {
    offset: { x: 24, y: 24 },
    createId: sequentialIds(),
  })

  assert.deepEqual(result.node, {
    ...source,
    id: 'new-1',
    x: 44,
    y: 64,
    children: undefined,
    callouts: undefined,
  })
  assert.deepEqual(result.contentPairs, [{ sourceId: 'code-1', duplicateId: 'new-1' }])
})

test('recursively rekeys frame children and remaps internal callout targets', () => {
  const source: LayoutNode = {
    id: 'frame-1',
    kind: 'frame',
    children: [
      { id: 'text-1', kind: 'text' },
      { id: 'image-1', kind: 'image', src: '/image.png', retainedSources: ['/old-image.png'] },
    ],
    callouts: [{ id: 'callout-1', targetId: 'text-1', dx: 10, dy: 20, text: 'Look here' }],
  }

  const result = planNodeDuplicate(source, { createId: sequentialIds() })

  assert.equal(result.node.id, 'new-1')
  assert.equal(result.node.children?.[0].id, 'new-2')
  assert.equal(result.node.children?.[1].id, 'new-3')
  assert.deepEqual(result.node.children?.[1].retainedSources, [])
  assert.equal(result.node.callouts?.[0].id, 'new-4')
  assert.equal(result.node.callouts?.[0].targetId, 'new-2')
  assert.deepEqual(result.contentPairs, [{ sourceId: 'text-1', duplicateId: 'new-2' }])
})

test('preserves callout targets outside the duplicated subtree', () => {
  const source: LayoutNode = {
    id: 'frame-1',
    kind: 'frame',
    callouts: [{ id: 'callout-1', targetId: 'external-node', dx: 0, dy: 0, text: '' }],
    children: [],
  }

  const result = planNodeDuplicate(source, { createId: sequentialIds() })
  assert.equal(result.node.callouts?.[0].targetId, 'external-node')
})

test('clears stale canvas coordinates when duplicating in flex flow', () => {
  const source: LayoutNode = { id: 'text-1', kind: 'text', x: 80, y: 120 }
  const result = planNodeDuplicate(source, {
    resetPosition: true,
    createId: sequentialIds(),
  })

  assert.equal(result.node.x, null)
  assert.equal(result.node.y, null)
})
