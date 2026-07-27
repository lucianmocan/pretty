'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  Group,
  Ungroup,
  Trash2,
  Download,
} from 'lucide-react'
import type {
  LayoutNode,
  FlexDirection,
  FlexAlign,
  FlexJustify,
  ChildLayout,
  PageSize,
} from '@/lib/layout/types'
import {
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CODE_BLOCK_HEIGHT,
  DEFAULT_CODE_BLOCK_WIDTH,
} from '@/lib/layout/types'
import { findNode, findParent, findFirstByKind, collectByKind } from '@/lib/layout/tree-utils'
import { alignNodes, distributeNodes, type PositionedNode, type AlignEdge } from '@/lib/layout/align-distribute'
import { listStylePresets, saveStylePreset, deleteStylePreset, type StylePreset } from '@/lib/presets/style-presets'
import { getYDoc } from '@/lib/yjs/doc-store'
import { deleteUploadedImage } from '@/lib/images/client'
import {
  updateFrameProps,
  updateCodeProps,
  updateImageProps,
  updateNodeSize,
  updateNodePosition,
  addCallout,
  groupNodes,
  ungroupNode,
  removeNode,
  ROOT_ID,
  type GutterClickMode,
} from '@/lib/yjs/layout-store'
import { FONT_OPTIONS, DEFAULT_LANGUAGE } from '@/lib/presets'
import {
  resolveThemeBackground,
  resolveThemeLineNumberForeground,
} from '@/lib/presets/custom-syntax-themes'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { NumericPresetControl } from '@/components/ui/numeric-preset-control'
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
import { ChromeStylePicker } from '@/components/ui/chrome-style-picker'
import { LanguagePicker } from '@/components/ui/language-picker'
import { IconField } from '@/components/ui/icon-field'
import { RadiusIcon } from '@/components/ui/radius-icon'
import { MIN_NODE_SIZE } from '@/lib/layout/resize-geometry'
import { useGeometryRegistry } from '@/components/canvas/geometry-registry'
import { geometryRecord, type NodeGeometry } from '@/lib/layout/geometry'
import {
  EXPORT_MARGIN_OPTIONS,
  MAX_EXPORT_MARGIN,
  MIN_EXPORT_MARGIN,
  setExportMargin,
  setExportQuality,
  setTransparentExport,
  useExportMargin,
  useExportQuality,
  useTransparentExport,
  type ExportQuality,
} from '@/lib/app-preferences'

interface InspectorPanelProps {
  docId: string
  tree: LayoutNode
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  gutterClickMode: GutterClickMode
  onGutterClickModeChange: (mode: GutterClickMode) => void
  // Opens the app-wide Customize dialog to the given tab -- triggered from
  // the theme swatch picker's "+" (syntax) and the custom chrome section's
  // "+" (chrome) below, not from a standalone menu entry anymore.
  onOpenCustomize: (tab: 'syntax' | 'chrome') => void
  onExportPdf: () => void
  onExportPng: () => void
  exporting: 'pdf' | 'png' | null
  exportError: string | null
}

const GUTTER_CLICK_MODE_OPTIONS: Array<{ value: GutterClickMode; label: string }> = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'diff', label: 'Diff' },
  { value: 'trim', label: 'Trim' },
]

const PAGE_SIZE_OPTIONS: Array<{ value: PageSize; label: string }> = [
  { value: 'content', label: 'Content-sized' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'custom', label: 'Custom' },
]

function toHexColor(value: string | null | undefined): string {
  if (value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value
  return '#282a36'
}

function IconTab({
  value,
  label,
  children,
  compact,
}: {
  value: string
  label: string
  children: ReactNode
  // Full-width stretched (flex-1) is right for a standalone full-row toggle
  // group; the condensed top toolbar packs several groups side by side, so
  // its items need to stay their own natural (icon) width instead.
  compact?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem value={value} className={compact ? undefined : 'flex-1'} aria-label={label}>
          {children}
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function InspectorCard({
  context,
  children,
}: {
  context: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const card = ref.current
    if (!card) return
    for (const heading of card.querySelectorAll<HTMLHeadingElement>('.scripture-inspector-section > h3')) {
      const section = heading.parentElement
      if (!section) continue
      const key = `scripture:inspector-section:${context}:${heading.textContent?.trim() || 'section'}`
      const collapsed = localStorage.getItem(key) === 'true'
      section.classList.toggle('is-collapsed', collapsed)
      heading.tabIndex = 0
      heading.setAttribute('role', 'button')
      heading.setAttribute('aria-expanded', String(!collapsed))
      heading.dataset.preferenceKey = key
    }
  }, [context])

  function toggle(target: EventTarget | null) {
    const heading = (target as HTMLElement | null)?.closest<HTMLHeadingElement>(
      '.scripture-inspector-section > h3'
    )
    if (!heading || !ref.current?.contains(heading)) return
    const section = heading.parentElement
    const key = heading.dataset.preferenceKey
    if (!section || !key) return
    const collapsed = section.classList.toggle('is-collapsed')
    heading.setAttribute('aria-expanded', String(!collapsed))
    localStorage.setItem(key, String(collapsed))
  }

  return (
    <Card
      ref={ref}
      className="scripture-inspector"
      size="sm"
      onClick={(event) => toggle(event.target)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).matches('h3')) {
          event.preventDefault()
          toggle(event.target)
        }
      }}
    >
      {children}
    </Card>
  )
}

function SizeSection({ node, docId }: { node: LayoutNode; docId: string }) {
  const { doc } = getYDoc(docId)
  const hasCustomSize = node.width != null || node.height != null
  const autoWidth =
    node.kind === 'code'
      ? DEFAULT_CODE_BLOCK_WIDTH
      : node.kind === 'frame' && node.childLayout === 'canvas'
        ? DEFAULT_CANVAS_WIDTH
        : 0
  const autoHeight =
    node.kind === 'code'
      ? DEFAULT_CODE_BLOCK_HEIGHT
      : node.kind === 'frame' && node.childLayout === 'canvas'
        ? DEFAULT_CANVAS_HEIGHT
        : 0
  return (
    <div className="scripture-inspector-section">
      <h3>Size</h3>
      <div className="scripture-inspector-row">
        <IconField
          icon={<MoveHorizontal size={14} />}
          title="Width"
          value={node.width ?? autoWidth}
          min={MIN_NODE_SIZE}
          onChange={(width) => updateNodeSize(doc, node.id, { width })}
        />
        <IconField
          icon={<MoveVertical size={14} />}
          title="Height"
          value={node.height ?? autoHeight}
          min={MIN_NODE_SIZE}
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
  const { geometry, measureAll } = useGeometryRegistry()
  const nodes = selectedIds.map((id) => findNode(tree, id)).filter((n): n is LayoutNode => n !== null)
  const parents = selectedIds.map((id) => findParent(tree, id))
  const commonParent = parents[0]
  const sameParent = commonParent != null && parents.every((p) => p?.id === commonParent.id)
  const isCanvasSelection = sameParent && commonParent.childLayout === 'canvas' && nodes.length === selectedIds.length

  const positioned: PositionedNode[] = nodes
    .map((node) => geometry.get(node.id))
    .filter((measured): measured is NodeGeometry => Boolean(measured))
  const hasMeasuredSelection = positioned.length === nodes.length

  function applyPatch(patch: Record<string, { x: number; y: number }>) {
    for (const [id, pos] of Object.entries(patch)) {
      updateNodePosition(doc, id, pos)
    }
  }

  function handleGroup() {
    measureAll()
    const groupId = groupNodes(doc, selectedIds, geometryRecord(geometry, selectedIds))
    if (groupId) onSelectionChange([groupId])
  }

  function handleDeleteAll() {
    for (const id of selectedIds) removeNode(doc, id)
    onSelectionChange([ROOT_ID])
  }

  return (
    <InspectorCard context="multi">
      <CardContent className="flex flex-col gap-5">
        <div className="scripture-inspector-section">
          <h3>{selectedIds.length} selected</h3>
          {!isCanvasSelection && (
            <p className="scripture-inspector-hint">
              Align, distribute, and grouping need every selected block to share the same canvas-mode parent frame.
            </p>
          )}
        </div>

        {isCanvasSelection && hasMeasuredSelection && (
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
                  size="sm"
                  disabled={positioned.length < 3}
                  onClick={() => applyPatch(distributeNodes(positioned, 'horizontal'))}
                >
                  Distribute horizontally
                </Button>
                <Button
                  variant="outline"
                  size="sm"
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
              <Button variant="outline" size="sm" onClick={handleGroup}>
                <Group /> Group selection
              </Button>
            </div>
          </>
        )}

        {isCanvasSelection && !hasMeasuredSelection && (
          <p className="scripture-inspector-hint">Measuring the selected layers…</p>
        )}

        <Separator />
        <div className="scripture-inspector-section">
          <Button variant="destructive" size="sm" onClick={handleDeleteAll}>
            Delete {selectedIds.length} blocks
          </Button>
        </div>
      </CardContent>
    </InspectorCard>
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
        <Button variant="outline" size="sm" onClick={handleSaveClick}>
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
  onOpenCustomize,
  onExportPdf,
  onExportPng,
  exporting,
  exportError,
}: InspectorPanelProps) {
  const { measureAll } = useGeometryRegistry()
  const exportQuality = useExportQuality()
  const exportMargin = useExportMargin()
  const transparentExport = useTransparentExport()

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
    const childLayout: ChildLayout = node.childLayout ?? 'flex'
    const isCanvasFrame = childLayout === 'canvas'
    const canUngroup = isCanvasFrame && node.id !== ROOT_ID
    return (
      <InspectorCard context={node.id === ROOT_ID ? 'canvas' : 'frame'}>
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>{node.id === ROOT_ID ? 'Canvas' : 'Frame'}</h3>

            {/* Layout mode comes FIRST -- it's the one decision that
                determines whether anything below even applies (canvas-mode
                children are freely positioned, not flowed, so none of the
                flex controls matter there). Everything else follows this,
                not the other way around. */}
            <div className="scripture-inspector-stack">
              <Label>Layout</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                className="w-full"
                value={childLayout}
                onValueChange={(value) => {
                  if (!value) return
                  const nextLayout = value as ChildLayout
                  const measuredChildren =
                    nextLayout === 'canvas'
                      ? geometryRecord(
                          measureAll(),
                          (node.children ?? []).map((child) => child.id)
                        )
                      : undefined
                  updateFrameProps(doc, node.id, { childLayout: nextLayout }, measuredChildren)
                }}
              >
                <ToggleGroupItem value="flex" className="flex-1">
                  Flex
                </ToggleGroupItem>
                <ToggleGroupItem value="canvas" className="flex-1">
                  Free-form
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="scripture-inspector-hint">
                Free-form mode lets children be freely dragged and positioned instead of flowing in a row/column.
              </p>
            </div>

            {!isCanvasFrame && (
              <>
                <Separator />

                {/* Direction/Align/Justify each get their own labeled stack
                    (label above a compact icon row) instead of one dense,
                    unlabeled toolbar -- matches the same label-above-control
                    layout "Layout" above already uses, and the existing
                    .scripture-inspector-stack styling was built with exactly
                    this in mind (see its CSS comment: a full-width segmented
                    control, especially Justify's 5 options, needs more room
                    than an inline label+control row can spare). */}
                <div className="scripture-inspector-stack">
                  <Label>Direction</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={node.direction ?? 'column'}
                    onValueChange={(v) => v && updateFrameProps(doc, node.id, { direction: v as FlexDirection })}
                  >
                    <IconTab value="column" label="Column" compact>
                      <Rows3 />
                    </IconTab>
                    <IconTab value="row" label="Row" compact>
                      <Columns3 />
                    </IconTab>
                  </ToggleGroup>
                </div>

                <div className="scripture-inspector-stack">
                  <Label>Align</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={node.align ?? 'flex-start'}
                    onValueChange={(v) => v && updateFrameProps(doc, node.id, { align: v as FlexAlign })}
                  >
                    <IconTab value="flex-start" label="Align start" compact>
                      <AlignStartVertical />
                    </IconTab>
                    <IconTab value="center" label="Align center" compact>
                      <AlignCenterVertical />
                    </IconTab>
                    <IconTab value="flex-end" label="Align end" compact>
                      <AlignEndVertical />
                    </IconTab>
                    <IconTab value="stretch" label="Stretch" compact>
                      <StretchHorizontal />
                    </IconTab>
                  </ToggleGroup>
                </div>

                <div className="scripture-inspector-stack">
                  <Label>Justify</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={node.justify ?? 'flex-start'}
                    onValueChange={(v) => v && updateFrameProps(doc, node.id, { justify: v as FlexJustify })}
                  >
                    <IconTab value="flex-start" label="Justify start" compact>
                      <AlignHorizontalJustifyStart />
                    </IconTab>
                    <IconTab value="center" label="Justify center" compact>
                      <AlignHorizontalJustifyCenter />
                    </IconTab>
                    <IconTab value="flex-end" label="Justify end" compact>
                      <AlignHorizontalJustifyEnd />
                    </IconTab>
                    <IconTab value="space-between" label="Space between" compact>
                      <AlignHorizontalSpaceBetween />
                    </IconTab>
                    <IconTab value="space-around" label="Space around" compact>
                      <AlignHorizontalSpaceAround />
                    </IconTab>
                  </ToggleGroup>
                </div>

                <div className="scripture-inspector-row">
                  <Label>Gap</Label>
                  <div className="w-20">
                    <IconField
                      icon={<ArrowLeftRight size={14} />}
                      value={node.gap ?? 0}
                      onChange={(gap) => updateFrameProps(doc, node.id, { gap })}
                    />
                  </div>
                </div>
                <div className="scripture-inspector-row">
                  <Label>Padding</Label>
                  <div className="w-20">
                    <IconField
                      icon={<RulerDimensionLine size={14} />}
                      value={node.padding ?? 0}
                      onChange={(padding) => updateFrameProps(doc, node.id, { padding })}
                    />
                  </div>
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
                  variant="outline"
                  size="sm"
                  disabled={node.background == null}
                  onClick={() => updateFrameProps(doc, node.id, { background: null })}
                >
                  Reset
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

          {/* For the root frame, manual width/height only affects a
              Content-sized export. Fixed paper formats own their dimensions,
              so the Size controls are hidden for those formats. */}
          {(node.id !== ROOT_ID || (node.pageSize ?? 'content') === 'content') && (
            <>
              <Separator />
              <SizeSection node={node} docId={docId} />
            </>
          )}

          {node.id === ROOT_ID && (
            <>
              <Separator />
              <div className="scripture-inspector-section">
                <h3>Export</h3>
                <div className="scripture-inspector-row">
                  <Label>Page size</Label>
                  <Select
                    value={node.pageSize ?? 'content'}
                    onValueChange={(v) => {
                      updateFrameProps(doc, node.id, { pageSize: v as PageSize })
                      // A manual width/height override only ever does anything at
                      // export time while Content-sized -- the fixed formats force
                      // their own paper width regardless (see
                      // app/api/export/route.ts), so leaving an old override in
                      // place here would silently make the on-screen card the
                      // wrong size with no way left to fix it (the Size section
                      // and resize handles are hidden for any non-Content page
                      // size.
                      if (v !== 'content') updateNodeSize(doc, node.id, { width: null, height: null })
                    }}
                  >
                    <SelectTrigger className="w-36" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
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
                <div className="scripture-inspector-stack">
                  <Label>Raster quality</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    className="w-full"
                    value={exportQuality}
                    onValueChange={(value) => value && setExportQuality(value as ExportQuality)}
                    aria-label="Export raster quality"
                  >
                    <ToggleGroupItem value="standard" className="flex-1">Standard</ToggleGroupItem>
                    <ToggleGroupItem value="high" className="flex-1">High</ToggleGroupItem>
                    <ToggleGroupItem value="maximum" className="flex-1">Maximum</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="scripture-inspector-stack">
                  <Label>Margin</Label>
                  <NumericPresetControl
                    value={exportMargin}
                    options={EXPORT_MARGIN_OPTIONS}
                    min={MIN_EXPORT_MARGIN}
                    max={MAX_EXPORT_MARGIN}
                    unit="px"
                    ariaLabel="Export margin"
                    onChange={setExportMargin}
                    className="w-full justify-start gap-1.5"
                    choiceClassName="min-w-6 px-1.5"
                    inputClassName="w-12 px-1.5"
                  />
                </div>
                <div className="scripture-inspector-row">
                  <Label>Transparent background</Label>
                  <Switch
                    checked={transparentExport}
                    onCheckedChange={setTransparentExport}
                    aria-label="Transparent export background"
                  />
                </div>
                <div className="scripture-inspector-actions">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onExportPdf}
                    disabled={exporting !== null}
                  >
                    <Download />
                    {exporting === 'pdf' ? 'Exporting PDF…' : 'Export PDF'}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onExportPng}
                    disabled={exporting !== null}
                  >
                    <Download />
                    {exporting === 'png' ? 'Exporting PNG…' : 'Export PNG'}
                  </Button>
                </div>
                <p className="scripture-inspector-hint">PDF includes every page. PNG exports the first page.</p>
                {exportError && <p className="scripture-error-text">{exportError}</p>}
              </div>
            </>
          )}

          {/* Code/Text/Image/Frame creation moved to the bottom canvas
              toolbar (components/canvas/canvas-toolbar.tsx) -- Figma-style,
              not tucked in the sidebar. Callout and Ungroup stay here: they're
              frame-specific actions, not part of that toolbar's general
              block-creation set. */}
          {(isCanvasFrame || canUngroup) && (
            <>
              <Separator />
              <div className="scripture-inspector-section">
                <h3>Frame actions</h3>
                <div className="scripture-inspector-actions">
                  {isCanvasFrame && (
                    // Not auto-selected -- callouts aren't tree nodes (they
                    // live on FrameProps.callouts, not lib/layout/tree-utils's
                    // findNode), so selecting one would resolve to nothing
                    // and blank the Inspector.
                    <Button variant="outline" size="sm" onClick={() => addCallout(doc, node.id)}>
                      <MessageSquarePlus /> + Callout
                    </Button>
                  )}
                  {canUngroup && (
                    <Button variant="ghost" size="sm" onClick={() => ungroupNode(doc, node.id)}>
                      <Ungroup /> Ungroup
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {node.id === ROOT_ID && (
            <>
              <Separator />
              <StylePresetsSection docId={docId} tree={tree} node={node} />
            </>
          )}
        </CardContent>
      </InspectorCard>
    )
  }

  if (node.kind === 'image') {
    return (
      <InspectorCard context="image">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Nothing ever called DELETE on an uploaded image before --
                  // every "replace" left the old file behind permanently.
                  deleteUploadedImage(node.src)
                  updateImageProps(doc, node.id, { src: '' })
                }}
              >
                Replace image
              </Button>
            )}
          </div>
          <Separator />
          <SizeSection node={node} docId={docId} />
        </CardContent>
      </InspectorCard>
    )
  }

  if (node.kind !== 'code') {
    return (
      <InspectorCard context="text">
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>Text block</h3>
          </div>
          <Separator />
          <SizeSection node={node} docId={docId} />
        </CardContent>
      </InspectorCard>
    )
  }

  return (
    <InspectorCard context="code">
      <CardContent className="flex flex-col gap-5">
        <div className="scripture-inspector-section">
          <h3>Code block</h3>

          <div className="scripture-inspector-row">
            <Label>Language</Label>
            <LanguagePicker
              value={node.language ?? DEFAULT_LANGUAGE}
              onChange={(v) => updateCodeProps(doc, node.id, { language: v })}
            />
          </div>

          <div className="scripture-inspector-stack">
            <Label>Theme</Label>
            <ThemeSwatchPicker
              value={node.theme ?? 'dracula'}
              onChange={(theme) =>
                updateCodeProps(doc, node.id, {
                  theme,
                  themeBackground: resolveThemeBackground(theme),
                  themeLineNumberForeground: resolveThemeLineNumberForeground(theme),
                })
              }
              onCreateCustom={() => onOpenCustomize('syntax')}
            />
          </div>
          <p className="scripture-inspector-hint">
            Themes color this code block only. Changing language or theme re-highlights existing code and clears manual
            bold, italic, or highlight formatting.
          </p>
        </div>

        <Separator />

        <div className="scripture-inspector-section">
          <h3>Appearance</h3>

          <div className="scripture-inspector-row">
            <Label>Font</Label>
            <Select value={node.fontFamily} onValueChange={(v) => updateCodeProps(doc, node.id, { fontFamily: v })}>
              <SelectTrigger className="w-36" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.key} value={f.key} className="text-xs">
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="scripture-inspector-stack">
            <Label>Window chrome</Label>
            <ChromeStylePicker
              value={node.chromeStyle === 'custom' ? 'custom' : (node.chromeStyle ?? 'none')}
              customChromeId={node.customChrome?.id}
              onSelectBuiltin={(style) => updateCodeProps(doc, node.id, { chromeStyle: style })}
              onSelectCustom={(style) => updateCodeProps(doc, node.id, { chromeStyle: 'custom', customChrome: style })}
              onCreateCustom={() => onOpenCustomize('chrome')}
            />
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
                  size="sm"
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
    </InspectorCard>
  )
}
