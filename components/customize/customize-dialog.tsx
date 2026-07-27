'use client'

import { useEffect, useState } from 'react'
import { Plus, Copy, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  createBlankCustomTheme,
  buildShikiTheme,
  SYNTAX_CATEGORIES,
  type CustomSyntaxTheme,
  type SyntaxCategory,
} from '@/lib/shiki/custom-theme'
import { listCustomSyntaxThemes, saveCustomSyntaxTheme, deleteCustomSyntaxTheme } from '@/lib/presets/custom-syntax-themes'
import {
  createBlankCustomChromeStyle,
  listCustomChromeStyles,
  saveCustomChromeStyle,
  deleteCustomChromeStyle,
} from '@/lib/presets/custom-chrome-styles'
import type { CustomChromeStyle, ChromeIconKey } from '@/lib/layout/types'
import { tokenizePreviewCode, type PlainToken } from '@/lib/shiki/tokenize'
import { CodeChrome } from '@/components/editor/code-chrome'

// Hits comment/keyword/string/number/function/variable/type-ish tokens so
// both editors' previews show a representative spread of categories.
const SAMPLE_CODE = `# Sample preview
import os

class Example:
    def __init__(self, name: str):
        self.name = name  # store it
        self.count = 42

    def greet(self) -> str:
        return f"Hello, {self.name}!"
`

const ICON_OPTIONS: Array<{ value: ChromeIconKey; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'file-code', label: 'File' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'folder', label: 'Folder' },
  { value: 'code', label: 'Code' },
  { value: 'braces', label: 'Braces' },
]

const COLOR_INPUT_CLASS = 'h-7 w-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5'

function TokenPreview({ lines }: { lines: PlainToken[][] }) {
  return (
    <div className="scripture-code-editor scripture-customize-preview-code">
      {lines.map((line, i) => (
        <div key={i}>
          {line.length === 0
            ? ' '
            : line.map((tok, j) => (
                <span
                  key={j}
                  style={{
                    color: tok.color ?? undefined,
                    fontWeight: tok.bold ? 600 : undefined,
                    fontStyle: tok.italic ? 'italic' : undefined,
                  }}
                >
                  {tok.content}
                </span>
              ))}
        </div>
      ))}
    </div>
  )
}

function SyntaxThemeEditor() {
  const [themes, setThemes] = useState<CustomSyntaxTheme[]>(() => listCustomSyntaxThemes())
  const [draft, setDraft] = useState<CustomSyntaxTheme | null>(themes[0] ?? null)
  const [preview, setPreview] = useState<PlainToken[][] | null>(null)

  function refreshList() {
    setThemes(listCustomSyntaxThemes())
  }

  function handleSelect(theme: CustomSyntaxTheme) {
    setDraft({ ...theme, colors: { ...theme.colors } })
  }

  function handleSave() {
    if (!draft) return
    saveCustomSyntaxTheme(draft)
    refreshList()
  }

  function handleDuplicate() {
    if (!draft) return
    const copy: CustomSyntaxTheme = { ...draft, id: crypto.randomUUID(), name: `${draft.name} copy` }
    saveCustomSyntaxTheme(copy)
    refreshList()
    setDraft(copy)
  }

  function handleDelete() {
    if (!draft) return
    deleteCustomSyntaxTheme(draft.id)
    refreshList()
    setDraft(null)
  }

  // Debounced re-tokenize with the in-progress (possibly unsaved) draft.
  // This intentionally uses a disposable server-side highlighter so each
  // color-picker movement does not permanently grow the editor worker cache.
  useEffect(() => {
    // No setPreview(null) here for the !draft case -- the JSX below already
    // gates rendering on `draft &&`, so a stale preview value lingering in
    // state while draft is null is simply never shown.
    if (!draft) return
    let cancelled = false
    const timer = setTimeout(() => {
      tokenizePreviewCode(SAMPLE_CODE, 'python', buildShikiTheme(draft))
        .then((result) => {
          if (!cancelled) setPreview(result.lines)
        })
        .catch((err) => console.error('Failed to preview custom syntax theme', err))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draft])

  const isSaved = draft ? themes.some((t) => t.id === draft.id) : false

  return (
    <div className="scripture-customize-body">
      <div className="scripture-customize-list">
        <Button variant="outline" size="sm" onClick={() => setDraft(createBlankCustomTheme())}>
          <Plus /> New theme
        </Button>
        {themes.map((theme) => (
          <Button
            key={theme.id}
            variant={draft?.id === theme.id ? 'secondary' : 'ghost'}
            size="sm"
            className="justify-start"
            onClick={() => handleSelect(theme)}
          >
            {theme.name}
          </Button>
        ))}
      </div>

      <div className="scripture-customize-form">
        {!draft ? (
          <p className="scripture-inspector-hint">Select a theme to edit, or create a new one.</p>
        ) : (
          <>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Theme name"
            />
            <div className="scripture-inspector-row">
              <Label>Background</Label>
              <input
                type="color"
                value={draft.background}
                onChange={(e) => setDraft({ ...draft, background: e.target.value })}
                className={COLOR_INPUT_CLASS}
              />
            </div>
            <div className="scripture-inspector-row">
              <Label>Foreground</Label>
              <input
                type="color"
                value={draft.foreground}
                onChange={(e) => setDraft({ ...draft, foreground: e.target.value })}
                className={COLOR_INPUT_CLASS}
              />
            </div>
            <Separator />
            <div className="scripture-customize-color-grid">
              {SYNTAX_CATEGORIES.map(({ key, label }) => (
                <div key={key} className="scripture-customize-color-field">
                  <input
                    type="color"
                    value={draft.colors[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, colors: { ...draft.colors, [key]: e.target.value } as Record<SyntaxCategory, string> })
                    }
                    className="h-6 w-6 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleDuplicate}>
                <Copy /> Duplicate
              </Button>
              {isSaved && (
                <Button size="sm" variant="destructive" onClick={handleDelete}>
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className="scripture-customize-preview"
        style={{
          background: draft?.background ?? '#1e1e1e',
          color: draft?.foreground ?? '#f8f8f2',
        }}
      >
        {draft && preview ? (
          <TokenPreview lines={preview} />
        ) : (
          <p className="scripture-inspector-hint">Preview appears here.</p>
        )}
      </div>
    </div>
  )
}

function ChromeStyleEditor() {
  const [styles, setStyles] = useState<CustomChromeStyle[]>(() => listCustomChromeStyles())
  const [draft, setDraft] = useState<CustomChromeStyle | null>(styles[0] ?? null)
  const [previewLines, setPreviewLines] = useState<PlainToken[][] | null>(null)

  function refreshList() {
    setStyles(listCustomChromeStyles())
  }

  function handleSelect(style: CustomChromeStyle) {
    setDraft({ ...style, dotColors: style.dotColors ? [...style.dotColors] : null })
  }

  function handleSave() {
    if (!draft) return
    saveCustomChromeStyle(draft)
    refreshList()
  }

  function handleDuplicate() {
    if (!draft) return
    const copy: CustomChromeStyle = { ...draft, id: crypto.randomUUID(), name: `${draft.name} copy` }
    saveCustomChromeStyle(copy)
    refreshList()
    setDraft(copy)
  }

  function handleDelete() {
    if (!draft) return
    deleteCustomChromeStyle(draft.id)
    refreshList()
    setDraft(null)
  }

  // The chrome bar's own colors don't affect the code CONTENT's token
  // colors -- one fixed bundled-theme tokenization up front is enough for
  // the preview's code area; only the CodeChrome wrapper re-renders as
  // chrome fields change, no re-tokenizing needed for that.
  useEffect(() => {
    tokenizePreviewCode(SAMPLE_CODE, 'python', 'dracula')
      .then((result) => setPreviewLines(result.lines))
      .catch((err) => console.error('Failed to tokenize chrome preview sample', err))
  }, [])

  const isSaved = draft ? styles.some((s) => s.id === draft.id) : false

  return (
    <div className="scripture-customize-body">
      <div className="scripture-customize-list">
        <Button variant="outline" size="sm" onClick={() => setDraft(createBlankCustomChromeStyle())}>
          <Plus /> New chrome
        </Button>
        {styles.map((style) => (
          <Button
            key={style.id}
            variant={draft?.id === style.id ? 'secondary' : 'ghost'}
            size="sm"
            className="justify-start"
            onClick={() => handleSelect(style)}
          >
            {style.name}
          </Button>
        ))}
      </div>

      <div className="scripture-customize-form">
        {!draft ? (
          <p className="scripture-inspector-hint">Select a chrome style to edit, or create a new one.</p>
        ) : (
          <>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Chrome style name"
            />
            <div className="scripture-inspector-row">
              <Label>Bar background</Label>
              <input
                type="color"
                value={draft.barBackground}
                onChange={(e) => setDraft({ ...draft, barBackground: e.target.value })}
                className={COLOR_INPUT_CLASS}
              />
            </div>
            <div className="scripture-inspector-row">
              <Label>Border color</Label>
              <input
                type="color"
                value={draft.barBorderColor}
                onChange={(e) => setDraft({ ...draft, barBorderColor: e.target.value })}
                className={COLOR_INPUT_CLASS}
              />
            </div>
            <div className="scripture-inspector-row">
              <Label>Text color</Label>
              <input
                type="color"
                value={draft.textColor}
                onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
                className={COLOR_INPUT_CLASS}
              />
            </div>

            <div className="scripture-inspector-row">
              <Label htmlFor="chrome-dots-switch">Traffic-light dots</Label>
              <Switch
                id="chrome-dots-switch"
                checked={draft.dotColors != null}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, dotColors: checked ? ['#ff5f56', '#ffbd2e', '#27c93f'] : null })
                }
              />
            </div>
            {draft.dotColors && (
              <div className="scripture-inspector-row">
                {draft.dotColors.map((color, i) => (
                  <input
                    key={i}
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const next = [...draft.dotColors!] as [string, string, string]
                      next[i] = e.target.value
                      setDraft({ ...draft, dotColors: next })
                    }}
                    className="h-6 w-6 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                ))}
              </div>
            )}

            <div className="scripture-inspector-row">
              <Label>Icon</Label>
              <Select value={draft.icon} onValueChange={(v) => setDraft({ ...draft, icon: v as ChromeIconKey })}>
                <SelectTrigger className="w-36" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="scripture-inspector-stack">
              <Label>Filename position</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                className="w-full"
                value={draft.filenamePosition}
                onValueChange={(v) => v && setDraft({ ...draft, filenamePosition: v as 'inline' | 'tab' })}
              >
                <ToggleGroupItem value="inline" className="flex-1">
                  Inline
                </ToggleGroupItem>
                <ToggleGroupItem value="tab" className="flex-1">
                  Tab
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="scripture-inspector-row">
              <Label>Corner radius</Label>
              <Input
                type="number"
                className="w-20"
                min={0}
                value={draft.radius}
                onChange={(e) => setDraft({ ...draft, radius: Number(e.target.value) || 0 })}
              />
            </div>

            <Separator />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleDuplicate}>
                <Copy /> Duplicate
              </Button>
              {isSaved && (
                <Button size="sm" variant="destructive" onClick={handleDelete}>
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="scripture-customize-preview">
        {draft && previewLines ? (
          <CodeChrome
            fontFamily="geist-mono"
            filename="script.py"
            chromeStyle="custom"
            customChrome={draft}
            showLineNumbers={false}
            lineCount={previewLines.length}
            startLineNumber={1}
            ligatures
            lineHeight={1.65}
            letterSpacing={0}
            highlightLines={[]}
            trimRanges={[]}
            diffLines={{}}
          >
            <TokenPreview lines={previewLines} />
          </CodeChrome>
        ) : (
          <p className="scripture-inspector-hint">Preview appears here.</p>
        )}
      </div>
    </div>
  )
}

type CustomizeTab = 'syntax' | 'chrome'

interface CustomizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Which tab to land on -- the theme swatch picker's "+" and the window
  // chrome section's "+" (components/canvas/inspector-panel.tsx) open this
  // same dialog instance to different tabs.
  initialTab?: CustomizeTab
}

/** App-wide customization window -- design reusable syntax themes and
 * window chrome styles with a live preview, opened from the Inspector's
 * theme swatch picker / custom chrome section (their own "+" buttons), not
 * a standalone menu entry. Fully independent of the current document: saved
 * items go into the two localStorage libraries (lib/presets/custom-syntax-
 * themes.ts, lib/presets/custom-chrome-styles.ts) and are picked up from
 * there by the Inspector's ThemeSwatchPicker / CustomChromeSection. */
export function CustomizeDialog({ open, onOpenChange, initialTab = 'syntax' }: CustomizeDialogProps) {
  const [tab, setTab] = useState<CustomizeTab>(initialTab)

  // Jump to whichever tab the caller opened this for -- the theme picker's
  // "+" and the chrome section's "+" target different tabs. Only re-synced
  // on the open transition (not on every initialTab change), so manually
  // switching tabs while the dialog is already open isn't fought.
  useEffect(() => {
    if (open) setTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Customize</DialogTitle>
          <DialogDescription>
            Design reusable syntax themes and window chrome styles, with a live preview.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full"
          value={tab}
          onValueChange={(v) => v && setTab(v as CustomizeTab)}
        >
          <ToggleGroupItem value="syntax" className="flex-1">
            Syntax themes
          </ToggleGroupItem>
          <ToggleGroupItem value="chrome" className="flex-1">
            Window chrome
          </ToggleGroupItem>
        </ToggleGroup>

        <Separator />

        {/* Both stay MOUNTED always, just hidden -- conditionally rendering
            only the active one would unmount+reset the other's in-progress
            draft (each manages its own useState internally) the moment you
            switch tabs, silently discarding any unsaved edits with no
            warning. Toggling display instead preserves both editors' state
            for as long as the dialog itself stays open. */}
        <div style={{ display: tab === 'syntax' ? 'contents' : 'none' }}>
          <SyntaxThemeEditor />
        </div>
        <div style={{ display: tab === 'chrome' ? 'contents' : 'none' }}>
          <ChromeStyleEditor />
        </div>
      </DialogContent>
    </Dialog>
  )
}
