'use client'

import { useState, type ReactNode } from 'react'
import {
  Rows3,
  Columns3,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  StretchHorizontal,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignHorizontalSpaceAround,
  ArrowLeftRight,
  RulerDimensionLine,
  MoveHorizontal,
  MoveVertical,
  MessageSquarePlus,
  ImagePlus,
  Group,
  Ungroup,
  Trash2,
} from 'lucide-react'
import type {
  LayoutNode,
  FlexDirection,
  FlexAlign,
  FlexJustify,
  ChildLayout,
  ChromeStyle,
  PageSize,
} from '@/lib/layout/types'
import { findNode, findParent, findFirstByKind, collectByKind } from '@/lib/layout/tree-utils'
import { alignNodes, distributeNodes, type PositionedNode, type AlignEdge } from '@/lib/layout/align-distribute'
import { listStylePresets, saveStylePreset, deleteStylePreset, type StylePreset } from '@/lib/presets/style-presets'
import { getYDoc } from '@/lib/yjs/doc-store'
import {
  addBlock,
  addFrame,
  updateFrameProps,
  updateCodeProps,
  updateImageProps,
  updateNodeSize,
  updateNodePosition,
  setBackgroundAuto,
  addCallout,
  groupNodes,
  ungroupNode,
  removeNode,
  ROOT_ID,
  type GutterClickMode,
} from '@/lib/yjs/layout-store'
import { LANGUAGES, FONT_OPTIONS } from '@/lib/presets'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ThemeSwatchPicker } from '@/components/ui/theme-swatch-picker'
import { IconField } from '@/components/ui/icon-field'
import { RadiusIcon } from '@/components/ui/radius-icon'

interface InspectorPanelProps {
  docId: string
  tree: LayoutNode
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  gutterClickMode: GutterClickMode
  onGutterClickModeChange: (mode: GutterClickMode) => void
}

const GUTTER_CLICK_MODE_OPTIONS: Array<{ value: GutterClickMode; label: string }> = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'diff', label: 'Diff' },
  { value: 'trim', label: 'Trim' },
]

const CHROME_STYLE_OPTIONS: Array<{ value: ChromeStyle; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'mac', label: 'Mac window' },
  { value: 'vscode-tab', label: 'VS Code tab' },
  { value: 'terminal', label: 'Terminal' },
]

const PAGE_SIZE_OPTIONS: Array<{ value: PageSize; label: string }> = [
  { value: 'content', label: 'Content-sized' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'custom', label: 'Custom' },
]

// Fallback box size for nodes with no explicit width/height override yet
// (still "size to content") -- align/distribute needs SOME number to work
// with; this roughly matches the CSS min-width/min-height a fresh block
// renders at (see .scripture-leaf in app/globals.css).
const AUTO_SIZE_FALLBACK = { width: 160, height: 32 }

function toHexColor(value: string | null | undefined): string {
  if (value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value
  return '#282a36'
}

function IconTab({ value, label, children }: { value: string; label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem value={value} className="flex-1" aria-label={label}>
          {children}
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function SizeSection({ node, docId }: { node: LayoutNode; docId: string }) {
  const { doc } = getYDoc(docId)
  const hasCustomSize = node.width != null || node.height != null
  return (
    <div className="scripture-inspector-section">
      <h3>Size</h3>
      <div className="scripture-inspector-row">
        <IconField
          icon={<MoveHorizontal size={14} />}
          title="Width"
          value={node.width ?? 0}
          onChange={(width) => updateNodeSize(doc, node.id, { width })}
        />
        <IconField
          icon={<MoveVertical size={14} />}
          title="Height"
          value={node.height ?? 0}
          onChange={(height) => updateNodeSize(doc, node.id, { height })}
        />
      </div>
      {hasCustomSize && (
        <Button variant="ghost" size="sm" onClick={() => updateNodeSize(doc, node.id, { width: null, height: null })}>
          Reset to auto
        </Button>
      )}
      <p className="scripture-inspector-hint">Drag the handles on a selected block&apos;s edges/corner to resize.</p>
    </div>
  )
}

const ALIGN_EDGE_OPTIONS: Array<{ edge: AlignEdge; label: string }> = [
  { edge: 'left', label: 'Left' },
  { edge: 'h-center', label: 'Center' },
  { edge: 'right', label: 'Right' },
]
const ALIGN_EDGE_OPTIONS_V: Array<{ edge: AlignEdge; label: string }> = [
  { edge: 'top', label: 'Top' },
  { edge: 'v-center', label: 'Middle' },
  { edge: 'bottom', label: 'Bottom' },
]

function MultiSelectPanel({
  docId,
  tree,
  selectedIds,
  onSelectionChange,
}: {
  docId: string
  tree: LayoutNode
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}) {
  const { doc } = getYDoc(docId)
  const nodes = selectedIds.map((id) => findNode(tree, id)).filter((n): n is LayoutNode => n !== null)
  const parents = selectedIds.map((id) => findParent(tree, id))
  const commonParent = parents[0]
  const sameParent = commonParent != null && parents.every((p) => p?.id === commonParent.id)
  const isCanvasSelection = sameParent && commonParent.childLayout === 'canvas' && nodes.length === selectedIds.length

  const positioned: PositionedNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x ?? 0,
    y: n.y ?? 0,
    width: n.width ?? AUTO_SIZE_FALLBACK.width,
    height: n.height ?? AUTO_SIZE_FALLBACK.height,
  }))

  function applyPatch(patch: Record<string, { x: number; y: number }>) {
    for (const [id, pos] of Object.entries(patch)) {
      updateNodePosition(doc, id, pos)
    }
  }

  function handleGroup() {
    const groupId = groupNodes(doc, selectedIds)
    if (groupId) onSelectionChange([groupId])
  }

  function handleDeleteAll() {
    for (const id of selectedIds) removeNode(doc, id)
    onSelectionChange([ROOT_ID])
  }

  return (
    <Card className="scripture-inspector" size="sm">
      <CardContent className="flex flex-col gap-5">
        <div className="scripture-inspector-section">
          <h3>{selectedIds.length} selected</h3>
          {!isCanvasSelection && (
            <p className="scripture-inspector-hint">
              Align, distribute, and grouping need every selected block to share the same canvas-mode parent frame.
            </p>
          )}
        </div>

        {isCanvasSelection && (
          <>
            <Separator />
            <div className="scripture-inspector-section">
              <h3>Align</h3>
              <div className="scripture-inspector-actions">
                <div className="flex gap-1.5">
                  {ALIGN_EDGE_OPTIONS.map((opt) => (
                    <Button
                      key={opt.edge}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => applyPatch(alignNodes(positioned, opt.edge))}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {ALIGN_EDGE_OPTIONS_V.map((opt) => (
                    <Button
                      key={opt.edge}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => applyPatch(alignNodes(positioned, opt.edge))}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Separator />
            <div className="scripture-inspector-section">
              <h3>Distribute</h3>
              <div className="scripture-inspector-actions">
                <Button
                  variant="outline"
                  disabled={positioned.length < 3}
                  onClick={() => applyPatch(distributeNodes(positioned, 'horizontal'))}
                >
                  Distribute horizontally
                </Button>
                <Button
                  variant="outline"
                  disabled={positioned.length < 3}
                  onClick={() => applyPatch(distributeNodes(positioned, 'vertical'))}
                >
                  Distribute vertically
                </Button>
              </div>
            </div>

            <Separator />
            <div className="scripture-inspector-section">
              <h3>Group</h3>
              <Button variant="outline" onClick={handleGroup}>
                <Group /> Group selection
              </Button>
            </div>
          </>
        )}

        <Separator />
        <div className="scripture-inspector-section">
          <Button variant="destructive" onClick={handleDeleteAll}>
            Delete {selectedIds.length} blocks
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Root-frame-only: save the whole document's current look (root FrameProps
 * + one representative code block's CodeBlockProps) as a reusable preset,
 * or bulk-apply a saved one across the root and every code block in the
 * tree via the same updateFrameProps/updateCodeProps mutations the rest of
 * the Inspector already uses one field at a time. */
function StylePresetsSection({ docId, tree, node }: { docId: string; tree: LayoutNode; node: LayoutNode }) {
  const { doc } = getYDoc(docId)
  const [presets, setPresets] = useState<StylePreset[]>(() => listStylePresets())
  const [savingName, setSavingName] = useState<string | null>(null)

  function handleSaveClick() {
    if (savingName === null) {
      setSavingName('')
      return
    }
    const codeNode = findFirstByKind(tree, 'code')
    saveStylePreset(
      savingName.trim() || 'Untitled preset',
      {
        direction: node.direction,
        gap: node.gap,
        padding: node.padding,
        align: node.align,
        justify: node.justify,
        background: node.background,
        radius: node.radius,
      },
      codeNode
        ? {
            fontFamily: codeNode.fontFamily,
            chromeStyle: codeNode.chromeStyle,
            ligatures: codeNode.ligatures,
            lineHeight: codeNode.lineHeight,
            letterSpacing: codeNode.letterSpacing,
          }
        : {}
    )
    setSavingName(null)
    setPresets(listStylePresets())
  }

  function handleApply(preset: StylePreset) {
    updateFrameProps(doc, ROOT_ID, preset.frame)
    for (const codeNode of collectByKind(tree, 'code')) {
      updateCodeProps(doc, codeNode.id, preset.code)
    }
  }

  function handleDelete(id: string) {
    deleteStylePreset(id)
    setPresets(listStylePresets())
  }

  return (
    <div className="scripture-inspector-section">
      <h3>Style presets</h3>
      {savingName !== null ? (
        <div className="scripture-inspector-row">
          <Input
            autoFocus
            className="flex-1"
            placeholder="Preset name"
            value={savingName}
            onChange={(e) => setSavingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveClick()
              if (e.key === 'Escape') setSavingName(null)
            }}
          />
          <Button size="sm" onClick={handleSaveClick}>
            Save
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={handleSaveClick}>
          Save current look as preset
        </Button>
      )}
      {presets.length > 0 && (
        <div className="scripture-inspector-actions">
          {presets.map((preset) => (
            <div key={preset.id} className="scripture-inspector-row">
              <Button variant="ghost" size="sm" className="flex-1 justify-start" onClick={() => handleApply(preset)}>
                {preset.name}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDelete(preset.id)}
                aria-label="Delete preset"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function InspectorPanel({
  docId,
  tree,
  selectedIds,
  onSelectionChange,
  gutterClickMode,
  onGutterClickModeChange,
}: InspectorPanelProps) {
  if (selectedIds.length > 1) {
    return (
      <MultiSelectPanel docId={docId} tree={tree} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
    )
  }

  const selectedId = selectedIds[0] ?? null
  const node = selectedId ? findNode(tree, selectedId) : tree
  if (!node) return null

  const { doc } = getYDoc(docId)

  if (node.kind === 'frame') {
    const backgroundAuto = node.backgroundAuto ?? true
    const childLayout: ChildLayout = node.childLayout ?? 'flex'
    const isCanvasFrame = childLayout === 'canvas'
    const canUngroup = isCanvasFrame && node.id !== ROOT_ID
    return (
      <Card className="scripture-inspector" size="sm">
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>{node.id === ROOT_ID ? 'Canvas' : 'Frame'}</h3>

            <div className="scripture-inspector-stack">
              <Label>Layout</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full"
                value={childLayout}
                onValueChange={(v) => v && updateFrameProps(doc, node.id, { childLayout: v as ChildLayout })}
              >
                <ToggleGroupItem value="flex" className="flex-1">
                  Flex
                </ToggleGroupItem>
                <ToggleGroupItem value="canvas" className="flex-1">
                  Canvas
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="scripture-inspector-hint">
                Canvas mode lets children be freely dragged and positioned instead of flowing in a row/column.
              </p>
            </div>

            {!isCanvasFrame && (
              <>
                <div className="scripture-inspector-stack">
                  <Label>Direction</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="w-full"
                    value={node.direction ?? 'column'}
                    onValueChange={(v) => v && updateFrameProps(doc, node.id, { direction: v as FlexDirection })}
                  >
                    <IconTab value="column" label="Column">
                      <Rows3 />
                    </IconTab>
                    <IconTab value="row" label="Row">
                      <Columns3 />
                    </IconTab>
                  </ToggleGroup>
                </div>

                <div className="scripture-inspector-stack">
                  <Label>Align</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="w-full"
                    value={node.align ?? 'flex-start'}
                    onValueChange={(v) => v && updateFrameProps(doc, node.id, { align: v as FlexAlign })}
                  >
                    <IconTab value="flex-start" label="Start">
                      <AlignStartVertical />
                    </IconTab>
                    <IconTab value="center" label="Center">
                      <AlignCenterVertical />
                    </IconTab>
                    <IconTab value="flex-end" label="End">
                      <AlignEndVertical />
                    </IconTab>
                    <IconTab value="stretch" label="Stretch">
                      <StretchHorizontal />
                    </IconTab>
                  </ToggleGroup>
                </div>

                <div className="scripture-inspector-stack">
                  <Label>Justify</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="w-full"
                    value={node.justify ?? 'flex-start'}
                    onValueChange={(v) => v && updateFrameProps(doc, node.id, { justify: v as FlexJustify })}
                  >
                    <IconTab value="flex-start" label="Start">
                      <AlignHorizontalJustifyStart />
                    </IconTab>
                    <IconTab value="center" label="Center">
                      <AlignHorizontalJustifyCenter />
                    </IconTab>
                    <IconTab value="flex-end" label="End">
                      <AlignHorizontalJustifyEnd />
                    </IconTab>
                    <IconTab value="space-between" label="Space between">
                      <AlignHorizontalSpaceBetween />
                    </IconTab>
                    <IconTab value="space-around" label="Space around">
                      <AlignHorizontalSpaceAround />
                    </IconTab>
                  </ToggleGroup>
                </div>

                <div className="scripture-inspector-row">
                  <IconField
                    icon={<ArrowLeftRight size={14} />}
                    title="Gap"
                    value={node.gap ?? 0}
                    onChange={(gap) => updateFrameProps(doc, node.id, { gap })}
                  />
                  <IconField
                    icon={<RulerDimensionLine size={14} />}
                    title="Padding"
                    value={node.padding ?? 0}
                    onChange={(padding) => updateFrameProps(doc, node.id, { padding })}
                  />
                </div>
              </>
            )}
          </div>

          <Separator />

          <div className="scripture-inspector-section">
            <h3>Appearance</h3>

            <div className="scripture-inspector-row">
              <Label>Background</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={backgroundAuto ? 'secondary' : 'outline'}
                  size="xs"
                  disabled={backgroundAuto}
                  onClick={() => setBackgroundAuto(doc, node.id, true)}
                >
                  Auto
                </Button>
                <input
                  type="color"
                  className="h-7 w-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  value={toHexColor(node.background)}
                  onChange={(e) => updateFrameProps(doc, node.id, { background: e.target.value })}
                />
              </div>
            </div>

            <div className="scripture-inspector-row">
              <Label>Radius</Label>
              <div className="w-20">
                <IconField
                  icon={<RadiusIcon />}
                  title="Radius"
                  value={node.radius ?? 0}
                  onChange={(radius) => updateFrameProps(doc, node.id, { radius })}
                />
              </div>
            </div>
          </div>

          {node.id === ROOT_ID && (
            <>
              <Separator />
              <div className="scripture-inspector-section">
                <h3>Export page size</h3>
                <div className="scripture-inspector-row">
                  <Label>Page size</Label>
                  <Select
                    value={node.pageSize ?? 'content'}
                    onValueChange={(v) => updateFrameProps(doc, node.id, { pageSize: v as PageSize })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {node.pageSize === 'custom' && (
                  <div className="scripture-inspector-row">
                    <IconField
                      icon={<MoveHorizontal size={14} />}
                      title="Width (mm)"
                      value={node.customPageWidthMm ?? 210}
                      onChange={(v) => updateFrameProps(doc, node.id, { customPageWidthMm: v })}
                    />
                    <IconField
                      icon={<MoveVertical size={14} />}
                      title="Height (mm)"
                      value={node.customPageHeightMm ?? 297}
                      onChange={(v) => updateFrameProps(doc, node.id, { customPageHeightMm: v })}
                    />
                  </div>
                )}
                <p className="scripture-inspector-hint">
                  Content-sized (default) exports at exactly the card&apos;s own size. The other options put that
                  same card onto a fixed paper size instead of resizing it to fill one.
                </p>
              </div>
            </>
          )}

          <Separator />

          <SizeSection node={node} docId={docId} />

          <Separator />

          <div className="scripture-inspector-section">
            <h3>Add to this frame</h3>
            <div className="scripture-inspector-actions">
              <Button variant="outline" onClick={() => onSelectionChange([addBlock(doc, node.id, 'code')])}>
                + Code block
              </Button>
              <Button variant="outline" onClick={() => onSelectionChange([addBlock(doc, node.id, 'text')])}>
                + Text block
              </Button>
              <Button variant="outline" onClick={() => onSelectionChange([addBlock(doc, node.id, 'image')])}>
                <ImagePlus /> + Image block
              </Button>
              <Button variant="outline" onClick={() => onSelectionChange([addFrame(doc, node.id)])}>
                + Nested frame
              </Button>
              {isCanvasFrame && (
                // Not auto-selected -- callouts aren't tree nodes (they live
                // on FrameProps.callouts, not lib/layout/tree-utils's
                // findNode), so selecting one would resolve to nothing and
                // blank the Inspector.
                <Button variant="outline" onClick={() => addCallout(doc, node.id)}>
                  <MessageSquarePlus /> + Callout
                </Button>
              )}
            </div>
            {canUngroup && (
              <Button variant="ghost" size="sm" onClick={() => ungroupNode(doc, node.id)}>
                <Ungroup /> Ungroup
              </Button>
            )}
          </div>

          {node.id === ROOT_ID && (
            <>
              <Separator />
              <StylePresetsSection docId={docId} tree={tree} node={node} />
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  if (node.kind === 'image') {
    return (
      <Card className="scripture-inspector" size="sm">
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>Image block</h3>
            <div className="scripture-inspector-row">
              <Label>Alt text</Label>
              <Input
                className="w-36"
                value={node.alt ?? ''}
                placeholder="Describe the image"
                onChange={(e) => updateImageProps(doc, node.id, { alt: e.target.value })}
              />
            </div>
            {node.src && (
              <Button variant="ghost" size="sm" onClick={() => updateImageProps(doc, node.id, { src: '' })}>
                Replace image
              </Button>
            )}
          </div>
          <Separator />
          <SizeSection node={node} docId={docId} />
        </CardContent>
      </Card>
    )
  }

  if (node.kind !== 'code') {
    return (
      <Card className="scripture-inspector" size="sm">
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>Text block</h3>
          </div>
          <Separator />
          <SizeSection node={node} docId={docId} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="scripture-inspector" size="sm">
      <CardContent className="flex flex-col gap-5">
        <div className="scripture-inspector-section">
          <h3>Code block</h3>

          <div className="scripture-inspector-row">
            <Label>Language</Label>
            <Select value={node.language} onValueChange={(v) => updateCodeProps(doc, node.id, { language: v })}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Label>Theme</Label>
          <ThemeSwatchPicker
            value={node.theme ?? 'dracula'}
            onChange={(theme) => updateCodeProps(doc, node.id, { theme })}
          />
          <p className="scripture-inspector-hint">
            Changing language or theme re-highlights the existing code, clearing any manual bold/italic/highlight on it.
          </p>
        </div>

        <Separator />

        <div className="scripture-inspector-section">
          <h3>Appearance</h3>

          <div className="scripture-inspector-row">
            <Label>Font</Label>
            <Select value={node.fontFamily} onValueChange={(v) => updateCodeProps(doc, node.id, { fontFamily: v })}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="scripture-inspector-row">
            <Label>Window chrome</Label>
            <Select
              value={node.chromeStyle ?? 'none'}
              onValueChange={(v) => updateCodeProps(doc, node.id, { chromeStyle: v as ChromeStyle })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHROME_STYLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="scripture-inspector-row">
            <Label>Filename</Label>
            <Input
              className="w-32"
              value={node.filename ?? ''}
              placeholder="main.py"
              onChange={(e) => updateCodeProps(doc, node.id, { filename: e.target.value })}
            />
          </div>

          <div className="scripture-inspector-row">
            <Label htmlFor="line-numbers-switch">Line numbers</Label>
            <Switch
              id="line-numbers-switch"
              checked={node.showLineNumbers ?? false}
              onCheckedChange={(checked) => updateCodeProps(doc, node.id, { showLineNumbers: checked })}
            />
          </div>

          {node.showLineNumbers && (
            <div className="scripture-inspector-row">
              <Label>Starts at</Label>
              <Input
                type="number"
                className="w-20"
                min={1}
                value={node.startLineNumber ?? 1}
                onChange={(e) => updateCodeProps(doc, node.id, { startLineNumber: Number(e.target.value) || 1 })}
              />
            </div>
          )}

          <div className="scripture-inspector-row">
            <Label htmlFor="ligatures-switch">Ligatures</Label>
            <Switch
              id="ligatures-switch"
              checked={node.ligatures ?? true}
              onCheckedChange={(checked) => updateCodeProps(doc, node.id, { ligatures: checked })}
            />
          </div>

          <div className="scripture-inspector-row">
            <Label>Line height</Label>
            <Input
              type="number"
              className="w-20"
              step={0.05}
              min={1}
              value={node.lineHeight ?? 1.65}
              onChange={(e) => updateCodeProps(doc, node.id, { lineHeight: Number(e.target.value) || 1.65 })}
            />
          </div>

          <div className="scripture-inspector-row">
            <Label>Letter spacing</Label>
            <Input
              type="number"
              className="w-20"
              step={0.1}
              value={node.letterSpacing ?? 0}
              onChange={(e) => updateCodeProps(doc, node.id, { letterSpacing: Number(e.target.value) || 0 })}
            />
          </div>
        </div>

        {node.showLineNumbers && (
          <>
            <Separator />
            <div className="scripture-inspector-section">
              <h3>Line annotations</h3>
              <div className="scripture-inspector-stack">
                <Label>Gutter click sets</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="w-full"
                  value={gutterClickMode}
                  onValueChange={(v) => v && onGutterClickModeChange(v as GutterClickMode)}
                >
                  {GUTTER_CLICK_MODE_OPTIONS.map((opt) => (
                    <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1">
                      {opt.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="scripture-inspector-hint">
                  Click a line number in the gutter to {gutterClickMode === 'highlight' && 'toggle it highlighted.'}
                  {gutterClickMode === 'diff' && 'cycle it through none / added / removed.'}
                  {gutterClickMode === 'trim' && 'toggle it into a collapsed "hidden" range.'}
                </p>
              </div>
            </div>
          </>
        )}

        <Separator />

        <SizeSection node={node} docId={docId} />
      </CardContent>
    </Card>
  )
}
