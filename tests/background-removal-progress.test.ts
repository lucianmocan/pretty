import assert from 'node:assert/strict'
import test from 'node:test'
import { friendlyBackgroundProgress } from '../lib/images/background-removal-progress.ts'

test('turns library callback keys into friendly phases', () => {
  const progress = friendlyBackgroundProgress('compute:inference', 1, 2)
  assert.equal(progress.label, 'Analyzing image')
  assert.equal(progress.detail, 'Separating the subject from its background.')
  assert.equal(progress.progress, 72)
  assert.equal(progress.label.includes('compute:'), false)
})

test('progress never moves backwards when a new asset download starts', () => {
  assert.equal(friendlyBackgroundProgress('fetch:model', 1, 100, 45).progress, 45)
})

test('progress handles missing totals without producing NaN', () => {
  const progress = friendlyBackgroundProgress('compute:encode', 0, 0, 96)
  assert.equal(progress.progress, 96)
  assert.equal(Number.isFinite(progress.progress), true)
})
