import assert from 'node:assert/strict'
import test from 'node:test'
import { deletePageResources } from '../lib/documents/delete-resources.ts'

test('page cleanup removes unique images and server data before local IndexedDB', async () => {
  const calls: string[] = []
  await deletePageResources('page-1', {
    async loadTree(pageId) {
      calls.push(`load:${pageId}`)
      return {
        id: 'root',
        kind: 'frame',
        children: [
          { id: 'a', kind: 'image', src: '/api/images/one' },
          { id: 'b', kind: 'frame', children: [{ id: 'c', kind: 'image', src: '/api/images/one' }] },
          { id: 'd', kind: 'image', src: '/api/images/two' },
        ],
      }
    },
    async deleteImage(src) {
      calls.push(`image:${src}`)
    },
    async deleteServerPage(pageId) {
      calls.push(`server:${pageId}`)
    },
    async deleteLocalPage(pageId) {
      calls.push(`local:${pageId}`)
    },
  })

  assert.deepEqual(calls, [
    'load:page-1',
    'image:/api/images/one',
    'image:/api/images/two',
    'server:page-1',
    'local:page-1',
  ])
})

test('page cleanup keeps local data when remote cleanup fails', async () => {
  const calls: string[] = []
  await assert.rejects(
    deletePageResources('page-1', {
      async loadTree() {
        return { id: 'root', kind: 'frame', children: [] }
      },
      async deleteImage() {},
      async deleteServerPage() {
        calls.push('server')
        throw new Error('offline')
      },
      async deleteLocalPage() {
        calls.push('local')
      },
    }),
    /offline/
  )
  assert.deepEqual(calls, ['server'])
})

