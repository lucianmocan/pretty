import type { LayoutNode, LayoutNodeKind } from './types'

export function findNode(tree: LayoutNode, id: string): LayoutNode | null {
  if (tree.id === id) return tree
  for (const child of tree.children ?? []) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

/** The direct parent frame of `id`, or null if `id` is the root or not found. */
export function findParent(tree: LayoutNode, id: string): LayoutNode | null {
  for (const child of tree.children ?? []) {
    if (child.id === id) return tree
    const found = findParent(child, id)
    if (found) return found
  }
  return null
}

export function findFirstByKind(tree: LayoutNode, kind: LayoutNodeKind): LayoutNode | null {
  if (tree.kind === kind) return tree
  for (const child of tree.children ?? []) {
    const found = findFirstByKind(child, kind)
    if (found) return found
  }
  return null
}

export function collectByKind(tree: LayoutNode, kind: LayoutNodeKind): LayoutNode[] {
  const results: LayoutNode[] = tree.kind === kind ? [tree] : []
  for (const child of tree.children ?? []) {
    results.push(...collectByKind(child, kind))
  }
  return results
}
