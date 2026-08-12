import assert from 'node:assert/strict'
import test from 'node:test'
import { deletePageResources } from '../lib/documents/delete-resources.ts'

test('page cleanup removes unique images before local IndexedDB', async () => {
  const calls: string[] = []
  await deletePageResources('page-1', {
    async loadTree(pageId) {
      calls.push(`load:${pageId}`)
      return {
        id: 'root',
        kind: 'frame',
        children: [
          { id: 'a', kind: 'image', src: 'local:one' },
          { id: 'b', kind: 'frame', children: [{ id: 'c', kind: 'image', src: 'local:one' }] },
          { id: 'd', kind: 'image', src: 'local:two', retainedSources: ['local:old'] },
        ],
      }
    },
    async deleteImage(src) {
      calls.push(`image:${src}`)
    },
    async deleteLocalPage(pageId) {
      calls.push(`local:${pageId}`)
    },
  })

  assert.deepEqual(calls, [
    'load:page-1',
    'image:local:one',
    'image:local:two',
    'image:local:old',
    'local:page-1',
  ])
})

test('page cleanup keeps local page data when image cleanup fails', async () => {
  const calls: string[] = []
  await assert.rejects(
    deletePageResources('page-1', {
      async loadTree() {
        return { id: 'root', kind: 'frame', children: [{ id: 'a', kind: 'image', src: 'local:one' }] }
      },
      async deleteImage() {
        calls.push('image')
        throw new Error('could not delete image')
      },
      async deleteLocalPage() {
        calls.push('local')
      },
    }),
    /could not delete image/
  )
  assert.deepEqual(calls, ['image'])
})
