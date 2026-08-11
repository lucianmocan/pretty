import type { ImageClipShape } from './types'

interface ShapePreset {
  value: ImageClipShape
  label: string
  // Undefined for 'none' -- a plain (optionally rounded via `radius`)
  // rectangle needs no clip-path at all.
  clipPath?: string
}

export const IMAGE_CLIP_SHAPES: ShapePreset[] = [
  { value: 'none', label: 'Rectangle' },
  { value: 'circle', label: 'Circle', clipPath: 'circle(50% at 50% 50%)' },
  { value: 'ellipse', label: 'Ellipse', clipPath: 'ellipse(50% 50% at 50% 50%)' },
  { value: 'triangle', label: 'Triangle', clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' },
  { value: 'diamond', label: 'Diamond', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  {
    value: 'hexagon',
    label: 'Hexagon',
    clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  },
  {
    value: 'star',
    label: 'Star',
    clipPath:
      'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  },
]

export function clipPathForShape(shape: ImageClipShape | undefined): string | undefined {
  return IMAGE_CLIP_SHAPES.find((preset) => preset.value === shape)?.clipPath
}
