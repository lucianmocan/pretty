import type { LayoutNode } from './types'

export interface DuplicatePlan {
  node: LayoutNode
  // Old -> new leaf IDs whose separately stored Tiptap fragments must also
  // be cloned. Images have no editor fragment and are intentionally omitted.
  contentPairs: Array<{ sourceId: string; duplicateId: string }>
}

/**
 * Creates an independent, recursively re-keyed layout snapshot. Keeping this
 * transformation pure makes the tricky identity behavior testable before
 * layout and editor content are inserted into Yjs atomically.
 */
export function planNodeDuplicate(
  source: LayoutNode,
  options: {
    offset?: { x: number; y: number }
    resetPosition?: boolean
    createId?: () => string
  } = {}
): DuplicatePlan {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const idMap = new Map<string, string>()
  const contentPairs: DuplicatePlan['contentPairs'] = []

  function rekey(node: LayoutNode): LayoutNode {
    const duplicateId = createId()
    idMap.set(node.id, duplicateId)
    if (node.kind === 'code' || node.kind === 'text') {
      contentPairs.push({ sourceId: node.id, duplicateId })
    }

    return {
      ...node,
      id: duplicateId,
      children: node.children?.map(rekey),
      callouts: node.callouts?.map((callout) => ({
        ...callout,
        id: createId(),
      })),
    }
  }

  const duplicate = rekey(source)

  function remapCalloutTargets(node: LayoutNode) {
    if (node.callouts) {
      node.callouts = node.callouts.map((callout) => ({
        ...callout,
        targetId: callout.targetId ? (idMap.get(callout.targetId) ?? callout.targetId) : null,
      }))
    }
    node.children?.forEach(remapCalloutTargets)
  }
  remapCalloutTargets(duplicate)

  if (options.offset) {
    duplicate.x = (source.x ?? 0) + options.offset.x
    duplicate.y = (source.y ?? 0) + options.offset.y
  } else if (options.resetPosition) {
    // Flex children do not currently use x/y. Clearing any stale coordinates
    // ensures a later switch to free-form assigns each sibling a fresh
    // cascade position instead of stacking the source and duplicate.
    duplicate.x = null
    duplicate.y = null
  }

  return { node: duplicate, contentPairs }
}
