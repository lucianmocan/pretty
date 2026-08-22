'use client'

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Ban,
  Bold,
  Code2,
  Highlighter,
  Italic,
  Link2,
  Minus,
  Palette,
  Plus,
  Strikethrough,
  Underline,
  Unlink,
} from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BlockKind } from './block-editor'
import { FontWeightPicker } from './font-weight-picker'
import type { TextFontSource } from '@/lib/layout/types'
import { runSelectionFormattingCommand } from '@/lib/tiptap/selection-formatting'

export const COLOR_PRESETS = [
  '#111827', '#6b7280', '#d1d5db', '#ffffff',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
]
export const HIGHLIGHT_PRESETS = COLOR_PRESETS
export const TEXT_COLOR_PRESETS = COLOR_PRESETS
const DEFAULT_CODE_FONT_SIZE = 14
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 96
const RECENT_COLORS_KEY = 'scripture:recent-format-colors'
let activeColorPickerId: string | null = null
const colorPickerSubscribers = new Set<() => void>()

function subscribeToActiveColorPicker(listener: () => void) {
  colorPickerSubscribers.add(listener)
  return () => colorPickerSubscribers.delete(listener)
}

function setActiveColorPicker(id: string | null) {
  if (activeColorPickerId === id) return
  activeColorPickerId = id
  colorPickerSubscribers.forEach((listener) => listener())
}

function currentFontSize(editor: Editor, fallback: number): number {
  const raw = editor.getAttributes('format').fontSize as string | null | undefined
  if (!raw) return fallback
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized
  const parsed = Number.parseInt(value, 16)
  if (!Number.isFinite(parsed) || value.length !== 6) return `rgba(250, 204, 21, ${alpha})`
  return `rgba(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}, ${alpha})`
}

function colorToHex(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  const match = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i)
  if (!match) return fallback
  return `#${[match[1], match[2], match[3]]
    .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0'))
    .join('')}`
}

function colorAlpha(value: string | null | undefined, fallback: number): number {
  const match = value?.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i)
  return match ? Math.max(0, Math.min(1, Number(match[1]))) : fallback
}

function readRecentColors(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function rememberColor(color: string) {
  const next = [color, ...readRecentColors().filter((item) => item !== color)].slice(0, 6)
  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next))
}

function ToolbarTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ColorPicker({
  label,
  value,
  presets,
  allowAlpha,
  onChange,
  onClear,
}: {
  label: string
  value?: string | null
  presets: string[]
  allowAlpha: boolean
  onChange: (color: string) => void
  onClear: () => void
}) {
  const pickerId = useId()
  const activePickerId = useSyncExternalStore(
    subscribeToActiveColorPicker,
    () => activeColorPickerId,
    () => null
  )
  const open = activePickerId === pickerId
  const fallback = label === 'Highlight color' ? '#eab308' : presets[0]
  const [hex, setHex] = useState(() => colorToHex(value, fallback))
  const [alpha, setAlpha] = useState(() => colorAlpha(value, allowAlpha ? 0.5 : 1))
  const [recents, setRecents] = useState<string[]>([])

  const apply = (nextHex: string, nextAlpha = alpha) => {
    setHex(nextHex)
    const color = allowAlpha ? hexToRgba(nextHex, nextAlpha) : nextHex
    onChange(color)
  }

  return (
    <Popover open={open} onOpenChange={(next) => {
      if (next) setActiveColorPicker(pickerId)
      else if (activeColorPickerId === pickerId) setActiveColorPicker(null)
      if (!next) return
      setHex(colorToHex(value, fallback))
      setAlpha(colorAlpha(value, allowAlpha ? 0.5 : 1))
      setRecents(readRecentColors())
    }}>
      <PopoverAnchor asChild>
        <Button
          variant="outline"
          size="sm"
          className="scripture-color-trigger"
          onClick={() => setActiveColorPicker(pickerId)}
          onMouseDown={(event) => event.preventDefault()}
          aria-label={label}
        >
          {label === 'Highlight color' ? <Highlighter /> : <Palette />}
          <span style={{ background: value || 'transparent' }} />
        </Button>
      </PopoverAnchor>
      <PopoverContent
        className="scripture-color-picker text-xs"
        align="end"
        sideOffset={8}
        collisionPadding={8}
      >
        <div className="scripture-color-picker-heading">
          <span>{label}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              onClear()
              setHex(fallback)
              setAlpha(allowAlpha ? 0.5 : 1)
            }}
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <Ban />
          </Button>
        </div>
        <div className="scripture-color-grid">
          {presets.map((color) => (
            <button
              type="button"
              key={color}
              className="scripture-swatch"
              style={{ background: allowAlpha ? hexToRgba(color, alpha) : color }}
              data-selected={color.toLowerCase() === hex.toLowerCase() || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                apply(color)
                rememberColor(color)
              }}
              aria-label={`${label} ${color}`}
            />
          ))}
        </div>
        {recents.length > 0 && (
          <>
            <small>Recent</small>
            <div className="scripture-color-grid">
              {recents.map((color) => (
                <button
                  type="button"
                  key={color}
                  className="scripture-swatch"
                  style={{ background: allowAlpha ? hexToRgba(color, alpha) : color }}
                  data-selected={color.toLowerCase() === hex.toLowerCase() || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => apply(color)}
                  aria-label={`${label} ${color}`}
                />
              ))}
            </div>
          </>
        )}
        <div className="scripture-color-custom">
          <input
            type="color"
            value={hex}
            onChange={(event) => apply(event.target.value)}
            onBlur={() => rememberColor(hex)}
            aria-label={`Choose custom ${label.toLowerCase()}`}
          />
          <Input
            value={hex}
            onChange={(event) => {
              const next = event.target.value
              setHex(next)
              if (/^#[0-9a-f]{6}$/i.test(next)) apply(next)
            }}
            onBlur={() => rememberColor(hex)}
            aria-label={`${label} hex value`}
          />
        </div>
        {allowAlpha && (
          <div className="scripture-color-alpha">
            <div className="scripture-color-alpha-heading">
              <span>Opacity</span>
              <output>{Math.round(alpha * 100)}%</output>
            </div>
            <Slider
              className="scripture-color-alpha-slider"
              min={1}
              max={100}
              step={1}
              value={[Math.round(alpha * 100)]}
              aria-label="Highlight opacity"
              onValueChange={([value]) => {
                const next = value / 100
                setAlpha(next)
                apply(hex, next)
              }}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function LinkPicker({ editor, href }: { editor: Editor; href: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(href)

  const apply = () => {
    const trimmed = url.trim()
    if (!trimmed) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const normalized = /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed) ? trimmed : `https://${trimmed}`
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => {
      if (next) setUrl(href)
      setOpen(next)
    }}>
      <PopoverTrigger asChild>
        <Toggle
          variant="outline"
          className="scripture-bubble-style-toggle"
          size="sm"
          pressed={Boolean(href)}
          onMouseDown={(event) => event.preventDefault()}
          onPressedChange={() => setOpen(true)}
          aria-label="Add or edit link"
        >
          <Link2 />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent className="scripture-link-picker text-xs" align="center" sideOffset={8}>
        <Input
          autoFocus
          className="text-xs"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') apply()
          }}
          placeholder="https://example.com"
          aria-label="Link URL"
        />
        <Button size="sm" onClick={apply}>Apply</Button>
        {href && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              setOpen(false)
            }}
            aria-label="Remove link"
          >
            <Unlink />
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export interface InlineFormattingState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  fontWeight: number
  highlight: string | null
  textColor: string | null
  href: string
  fontFamily: string
  fontSource: TextFontSource
}

export function InlineFormattingControls({
  editor,
  kind,
  state,
  surface = 'inspector',
}: {
  editor: Editor
  kind: BlockKind
  state: InlineFormattingState
  surface?: 'inspector' | 'bubble'
}) {
  const runFormattingCommand = (command: Parameters<typeof runSelectionFormattingCommand>[1]) =>
    runSelectionFormattingCommand(editor, command, surface === 'inspector')

  return (
    <>
      <FontWeightPicker
        value={state.fontWeight}
        fontFamily={state.fontFamily}
        fontSource={state.fontSource}
        surface={surface}
        showTrigger={surface === 'bubble'}
        onChange={(weight) => runFormattingCommand((chain) =>
          chain.unsetBold().setFontWeight(weight)
        )}
      >
        <Toggle
          variant="outline"
          className="scripture-bubble-style-toggle"
          size="sm"
          pressed={state.bold}
          onMouseDown={(event) => event.preventDefault()}
          onPressedChange={(pressed) => {
            runFormattingCommand((chain) =>
              chain.unsetBold().setFontWeight(pressed ? 700 : 400)
            )
          }}
          aria-label="Bold"
        >
          <Bold />
        </Toggle>
      </FontWeightPicker>
      <Toggle
        variant="outline"
        className="scripture-bubble-style-toggle"
        size="sm"
        pressed={state.italic}
        onMouseDown={(event) => event.preventDefault()}
        onPressedChange={() => runFormattingCommand((chain) => chain.toggleItalic())}
        aria-label="Italic"
      >
        <Italic />
      </Toggle>
      {kind === 'text' && (
        <>
          <Toggle
            variant="outline"
            className="scripture-bubble-style-toggle"
            size="sm"
            pressed={state.underline}
            onMouseDown={(event) => event.preventDefault()}
            onPressedChange={() => runFormattingCommand((chain) => chain.toggleUnderline())}
            aria-label="Underline"
          >
            <Underline />
          </Toggle>
          <Toggle
            variant="outline"
            className="scripture-bubble-style-toggle"
            size="sm"
            pressed={state.strike}
            onMouseDown={(event) => event.preventDefault()}
            onPressedChange={() => runFormattingCommand((chain) => chain.toggleStrike())}
            aria-label="Strikethrough"
          >
            <Strikethrough />
          </Toggle>
          <Toggle
            variant="outline"
            className="scripture-bubble-style-toggle"
            size="sm"
            pressed={state.code}
            onMouseDown={(event) => event.preventDefault()}
            onPressedChange={() => runFormattingCommand((chain) => chain.toggleCode())}
            aria-label="Inline code"
          >
            <Code2 />
          </Toggle>
          <ColorPicker
            label="Text color"
            value={state.textColor}
            presets={TEXT_COLOR_PRESETS}
            allowAlpha={false}
            onChange={(color) => runFormattingCommand((chain) => chain.setTextColor(color))}
            onClear={() => runFormattingCommand((chain) => chain.unsetTextColor())}
          />
        </>
      )}
      <ColorPicker
        label="Highlight color"
        value={state.highlight}
        presets={HIGHLIGHT_PRESETS}
        allowAlpha
        onChange={(color) => runFormattingCommand((chain) => chain.setHighlight(color))}
        onClear={() => runFormattingCommand((chain) => chain.unsetHighlight())}
      />
      {kind === 'text' && <LinkPicker editor={editor} href={state.href} />}
    </>
  )
}

export function BubbleToolbar({
  editor,
  kind,
  fontFamily,
  fontSource,
}: {
  editor: Editor
  kind: BlockKind
  fontFamily?: string
  fontSource?: TextFontSource
}) {
  const fallbackFontSize = DEFAULT_CODE_FONT_SIZE
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const format = currentEditor.getAttributes('format')
      const heading = currentEditor.isActive('heading')
      const parsedFontWeight = Number.parseInt(String(format.fontWeight), 10)
      const fontWeight = Number.isFinite(parsedFontWeight) ? parsedFontWeight : heading ? 700 : 400
      return {
        bold: currentEditor.isActive('bold') || fontWeight >= 600,
        italic: currentEditor.isActive('italic'),
        underline: currentEditor.isActive('underline'),
        strike: currentEditor.isActive('strike'),
        code: currentEditor.isActive('code'),
        fontWeight,
        fontSize: currentFontSize(currentEditor, fallbackFontSize),
        highlight: typeof format.highlight === 'string' ? format.highlight : null,
        textColor: typeof format.textColor === 'string' ? format.textColor : null,
        href: (currentEditor.getAttributes('link').href as string | undefined) ?? '',
        fontFamily: typeof format.fontFamily === 'string' ? format.fontFamily : (fontFamily ?? 'Geist Sans'),
        fontSource:
          format.fontSource === 'google' || format.fontSource === 'system'
            ? format.fontSource
            : (fontSource ?? 'local'),
      }
    },
  })

  const adjustFontSize = (delta: number) => {
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, currentFontSize(editor, fallbackFontSize) + delta))
    editor.chain().focus().setFontSize(`${next}px`).run()
  }
  return (
    <BubbleMenu
      editor={editor}
      className={kind === 'text' ? 'scripture-bubble-menu is-text' : 'scripture-bubble-menu is-code'}
      shouldShow={({ state }) => !state.selection.empty}
      appendTo={() => document.body}
      options={{ placement: 'top', offset: 10, flip: true, strategy: 'fixed' }}
    >
      <div className="scripture-inline-format-controls scripture-bubble-inline-format-controls">
        <InlineFormattingControls editor={editor} kind={kind} state={toolbarState} surface="bubble" />
      </div>

      {kind === 'code' && (
        <>
          <span className="scripture-bubble-divider" />
          <ToolbarTooltip label="Decrease font size">
            <Button variant="ghost" size="icon-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => adjustFontSize(-1)} aria-label="Decrease font size"><Minus /></Button>
          </ToolbarTooltip>
          <button
            type="button"
            className="scripture-font-size"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().unsetFontSize().run()}
            title="Reset font size"
          >
            {toolbarState.fontSize}px
          </button>
          <ToolbarTooltip label="Increase font size">
            <Button variant="ghost" size="icon-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => adjustFontSize(1)} aria-label="Increase font size"><Plus /></Button>
          </ToolbarTooltip>
        </>
      )}
    </BubbleMenu>
  )
}
