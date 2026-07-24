import assert from 'node:assert/strict'
import test from 'node:test'
import { rankLanguageSearch } from '../lib/language-search.ts'

test('an exact canonical language outranks a longer prefix match', () => {
  const c = rankLanguageSearch('c', 'C', undefined, 'c')
  const closure = rankLanguageSearch('soy', 'Closure Templates', ['closure-templates'], 'c')

  assert.ok(c > closure)
})

test('an exact alias outranks loose name matches', () => {
  const typescript = rankLanguageSearch('typescript', 'TypeScript', ['ts'], 'ts')
  const tsx = rankLanguageSearch('tsx', 'TSX', undefined, 'ts')

  assert.ok(typescript > tsx)
})

test('matching is case-insensitive and hides unrelated languages', () => {
  assert.equal(rankLanguageSearch('javascript', 'JavaScript', ['js'], 'SCRIPT'), 0.6)
  assert.equal(rankLanguageSearch('rust', 'Rust', ['rs'], 'python'), 0)
})
