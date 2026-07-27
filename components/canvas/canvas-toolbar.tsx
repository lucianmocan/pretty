'use client'

import { FileCode, Type, ImagePlus, Frame as FrameIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { findNode, findParent } from '@/lib/layout/tree-utils'
import { addBlock, addFrame, ROOT_ID } from '@/lib/yjs/layout-store'
import { getYDoc } from '@/lib/yjs/doc-store'
import type { LayoutNode } from '@/lib/layout/types'

interface CanvasToolbarProps {
  docId: string
  tree: LayoutNode
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onSetEditing: (id: string | null) => void
}

/** Resolves which frame a new block should land in: the currently selected
 * frame itself, or the nearest ancestor frame of whatever leaf is selected --
 * same placement rule the old Inspector "Add to this frame" section used. */
function resolveTargetFrameId(tree: LayoutNode, selectedIds: string[]): string {
  const node = findNode(tree, selectedIds[0] ?? ROOT_ID)
  if (!node) return ROOT_ID
  if (node.kind === 'frame') return node.id
  return findParent(tree, node.id)?.id ?? ROOT_ID
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Figma-style bottom-center floating toolbar -- block-creation actions,
 * replacing the Inspector's old "Add to this frame" section. Code/text
 * blocks auto-enter edit mode on creation (matching the "new block is
 * immediately typable" UX the auto-select behavior always aimed for);
 * image/frame have no text content to edit, so they're just selected. */
export function CanvasToolbar({
  docId,
  tree,
  selectedIds,
  onSelectionChange,
  onSetEditing,
}: CanvasToolbarProps) {
  const { doc } = getYDoc(docId)

  function handleAddBlock(kind: 'code' | 'text' | 'image') {
    const frameId = resolveTargetFrameId(tree, selectedIds)
    const newId = addBlock(doc, frameId, kind)
    onSelectionChange([newId])
    if (kind !== 'image') onSetEditing(newId)
  }

  function handleAddFrame() {
    const frameId = resolveTargetFrameId(tree, selectedIds)
    const newId = addFrame(doc, frameId)
    onSelectionChange([newId])
  }

  return (
    // Kept propagation-isolated from the surrounding canvas stage so this
    // remains safe if the stage gains click-to-deselect behavior later.
    <div className="scripture-canvas-toolbar" onClick={(e) => e.stopPropagation()}>
      <ToolbarButton label="Add code block" onClick={() => handleAddBlock('code')}>
        <FileCode />
      </ToolbarButton>
      <ToolbarButton label="Add text block" onClick={() => handleAddBlock('text')}>
        <Type />
      </ToolbarButton>
      <ToolbarButton label="Add image block" onClick={() => handleAddBlock('image')}>
        <ImagePlus />
      </ToolbarButton>
      <ToolbarButton label="Add nested frame" onClick={handleAddFrame}>
        <FrameIcon />
      </ToolbarButton>
    </div>
  )
}
