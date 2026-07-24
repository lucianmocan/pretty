import { DEFAULT_CODE_BLOCK_PROPS, type FrameProps, type LayoutNode } from '@/lib/layout/types'

export interface Template {
  id: string
  name: string
  description: string
  rootProps?: Partial<FrameProps>
  children: () => LayoutNode[]
}

function codeChild(): LayoutNode {
  return { id: crypto.randomUUID(), kind: 'code', ...DEFAULT_CODE_BLOCK_PROPS }
}

/** Starter layouts offered when creating a new document -- each just seeds
 * the root frame's direction + a handful of empty code blocks via
 * seedRootFrame (lib/yjs/layout-store.ts), so picking one is equivalent to
 * manually adding blocks/setting Direction right after creating a blank doc. */
export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from an empty canvas.',
    children: () => [],
  },
  {
    id: 'single',
    name: 'Single block',
    description: 'One code block, ready to paste into.',
    rootProps: { childLayout: 'flex' },
    children: () => [codeChild()],
  },
  {
    id: 'before-after',
    name: 'Before / After',
    description: 'Two code blocks side by side, for comparisons.',
    rootProps: { childLayout: 'flex', direction: 'row' },
    children: () => [codeChild(), codeChild()],
  },
  {
    id: 'three-up',
    name: '3-up',
    description: 'Three code blocks side by side.',
    rootProps: { childLayout: 'flex', direction: 'row' },
    children: () => [codeChild(), codeChild(), codeChild()],
  },
]
