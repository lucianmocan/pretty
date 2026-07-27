'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState, type Editor } from '@tiptap/react'
import { Bold, Italic, Ban, Minus, Plus } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: 'rgba(250, 204, 21, 0.45)' },
  { label: 'Green', value: 'rgba(74, 222, 128, 0.4)' },
  { label: 'Blue', value: 'rgba(96, 165, 250, 0.4)' },
  { label: 'Pink', value: 'rgba(244, 114, 182, 0.4)' },
]

const DEFAULT_FONT_SIZE = 14
const FONT_SIZE_STEP = 1
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 48

function currentFontSize(editor: Editor): number {
  const raw = editor.getAttributes('format').fontSize as string | null | undefined
  if (!raw) return DEFAULT_FONT_SIZE
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULT_FONT_SIZE
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      fontSize: currentFontSize(currentEditor),
    }),
  })
  const adjustFontSize = (delta: number) => {
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, currentFontSize(editor) + delta))
    editor.chain().focus().setFontSize(`${next}px`).run()
  }

  return (
    <BubbleMenu
      editor={editor}
      className="scripture-bubble-menu"
      shouldShow={({ state }) => !state.selection.empty}
      // Tiptap otherwise appends this beside the editor, where a resized
      // block's inner overflow container clips it. Portaling to body with
      // fixed positioning keeps it anchored to the selection while letting
      // it float across every nested frame boundary.
      appendTo={() => document.body}
      options={{ placement: 'top', offset: 10, flip: true, strategy: 'fixed' }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolbarState.bold}
            onMouseDown={(e) => e.preventDefault()}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            aria-label="Bold"
          >
            <Bold />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Bold</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolbarState.italic}
            onMouseDown={(e) => e.preventDefault()}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            aria-label="Italic"
          >
            <Italic />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Italic</TooltipContent>
      </Tooltip>

      <span className="scripture-bubble-divider" />

      {HIGHLIGHT_COLORS.map((color) => (
        <Tooltip key={color.value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="scripture-swatch"
              style={{ backgroundColor: color.value }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setHighlight(color.value).run()}
              aria-label={`Highlight ${color.label}`}
            />
          </TooltipTrigger>
          <TooltipContent>{`Highlight ${color.label}`}</TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            aria-label="Remove highlight"
          >
            <Ban />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove highlight</TooltipContent>
      </Tooltip>

      <span className="scripture-bubble-divider" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustFontSize(-FONT_SIZE_STEP)}
            aria-label="Decrease font size"
          >
            <Minus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Decrease font size</TooltipContent>
      </Tooltip>
      <span className="scripture-font-size">{toolbarState.fontSize}px</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustFontSize(FONT_SIZE_STEP)}
            aria-label="Increase font size"
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Increase font size</TooltipContent>
      </Tooltip>
    </BubbleMenu>
  )
}
