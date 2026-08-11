import type { LayoutNode } from '../layout/types'
import { collectByKind } from '../layout/tree-utils.ts'

export interface PageDeletionDependencies {
  loadTree: (pageId: string) => Promise<LayoutNode | null>
  deleteImage: (src: string) => Promise<void>
  deleteServerPage: (pageId: string) => Promise<void>
  deleteLocalPage: (pageId: string) => Promise<void>
}

export async function deletePageResources(pageId: string, deps: PageDeletionDependencies): Promise<void> {
  const tree = await deps.loadTree(pageId)
  const imageUrls = tree
    ? Array.from(
        new Set(
          collectByKind(tree, 'image')
            .flatMap((node) => [node.src, ...(node.retainedSources ?? [])])
            .filter((src): src is string => Boolean(src))
        )
      )
    : []

  // Local IndexedDB is last so a failed network cleanup remains retryable.
  for (const src of imageUrls) await deps.deleteImage(src)
  await deps.deleteServerPage(pageId)
  await deps.deleteLocalPage(pageId)
}
