'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
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
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListChecks,
  IndentDecrease,
  IndentIncrease,
  RemoveFormatting,
  Type,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  ArrowLeft,
  Crop,
  Eraser,
  LoaderCircle,
  ImagePlus,
  RotateCcw,
  Circle as CircleIcon,
  Triangle as TriangleIcon,
  Diamond as DiamondIcon,
  Hexagon as HexagonIcon,
  Star as StarIcon,
  RectangleHorizontal,
} from 'lucide-react'
import type {
  LayoutNode,
  FlexDirection,
  FlexAlign,
  FlexJustify,
  ChildLayout,
  CanvasSizeMode,
  PageSize,
  TextFontSource,
  ImageClipShape,
} from '@/lib/layout/types'
import {
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CODE_BLOCK_HEIGHT,
  DEFAULT_CODE_BLOCK_WIDTH,
  DEFAULT_TEXT_BLOCK_PROPS,
} from '@/lib/layout/types'
import { findNode, findParent, findFirstByKind, collectByKind } from '@/lib/layout/tree-utils'
import { alignNodes, distributeNodes, type PositionedNode, type AlignEdge } from '@/lib/layout/align-distribute'
import { listStylePresets, saveStylePreset, deleteStylePreset, type StylePreset } from '@/lib/presets/style-presets'
import { blockFragmentName, getYDoc } from '@/lib/yjs/doc-store'
import {
  clearFormatAttributesInStaticBlock,
  staticBlockJSON,
} from '@/lib/tiptap/static-block-document'
import { deleteUploadedImage, uploadImageFile } from '@/lib/images/client'
import { useLocalImageSrc } from '@/lib/images/use-local-image-src'
import { removeImageBackground } from '@/lib/images/background-removal'
import { friendlyBackgroundProgress } from '@/lib/images/background-removal-progress'
import {
  clearBackgroundRemovalState,
  getBackgroundRemovalState,
  setBackgroundRemovalState,
  useBackgroundRemovalState,
} from '@/lib/images/background-removal-state'
import { IMAGE_CLIP_SHAPES } from '@/lib/layout/image-shapes'
import { croppedImageFrameSize, normalizeImageCrop } from '@/lib/layout/image-crop'
import { normalizeImageEffects, type ImageEffectPreview } from '@/lib/layout/image-effects'
import { ImageCropDialog, type CropRequest, type CropResult } from '@/components/canvas/image-crop-dialog'
import {
  updateFrameProps,
  updateCodeProps,
  updateTextProps,
  updateImageProps,
  updateNodeSize,
  updateNodePosition,
  addCallout,
  groupNodes,
  ungroupNode,
  removeNode,
  ROOT_ID,
  type GutterClickMode,
  toPlainTree,
} from '@/lib/yjs/layout-store'
import { FONT_OPTIONS, DEFAULT_LANGUAGE } from '@/lib/presets'
import {
  resolveThemeBackground,
  resolveThemeLineNumberForeground,
} from '@/lib/presets/custom-syntax-themes'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { NumericPresetControl } from '@/components/ui/numeric-preset-control'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { FontPicker } from '@/components/editor/font-picker'
import {
  ColorPicker,
  HIGHLIGHT_PRESETS,
  InlineFormattingControls,
  TEXT_COLOR_PRESETS,
} from '@/components/editor/bubble-toolbar'
import { FontWeightPicker } from '@/components/editor/font-weight-picker'
import { GoogleFontLoader } from '@/components/editor/google-font-loader'
import { useEditorRegistry } from '@/components/editor/editor-registry'
import { IconField } from '@/components/ui/icon-field'
import { RadiusIcon } from '@/components/ui/radius-icon'
import { MIN_NODE_SIZE } from '@/lib/layout/resize-geometry'
import { useGeometryActions, useGeometryRegistry } from '@/components/canvas/geometry-registry'
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
import {
  DEFAULT_PAGE_NUMBER_TYPOGRAPHY,
  type PageNumberHorizontalPosition,
  type PageNumberNumeralStyle,
  type PageNumberSettings,
  type PageNumberTypography,
  type PageNumberVerticalPosition,
} from '@/lib/documents/manifest'
import {
  formatPageNumber,
  pageNumberTypographyStyle,
} from '@/lib/documents/page-numbers'

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
  onSetEditing: (id: string | null) => void
  pageNumberSettings: PageNumberSettings
  onPageNumberSettingsChange: (settings: PageNumberSettings) => void
  pageIds: string[]
  pageNames: Record<string, string>
  onImageEffectPreviewChange: (preview: ImageEffectPreview | null) => void
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

const CANVAS_SIZE_PRESETS = [
  { value: 'auto', label: 'Default · 3:2', width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT },
  { value: 'slides-16-9', label: 'Slides · 16:9', width: 1280, height: 720 },
  { value: 'slides-4-3', label: 'Slides · 4:3', width: 1024, height: 768 },
  { value: 'square', label: 'Square · 1:1', width: 1080, height: 1080 },
  { value: 'portrait-4-5', label: 'Portrait · 4:5', width: 1080, height: 1350 },
  { value: 'story-9-16', label: 'Story · 9:16', width: 1080, height: 1920 },
] as const

function canvasSizePresetValue(node: LayoutNode): string {
  if ((node.pageSize ?? 'content') !== 'content') return 'export-sized'
  if (node.canvasSizeMode === 'custom') return 'custom'
  if (node.canvasSizeMode && CANVAS_SIZE_PRESETS.some((preset) => preset.value === node.canvasSizeMode)) {
    return node.canvasSizeMode
  }
  const width = node.width ?? DEFAULT_CANVAS_WIDTH
  const height = node.height ?? DEFAULT_CANVAS_HEIGHT
  return CANVAS_SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height)?.value ?? 'custom'
}

const TEXT_FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]
const TEXT_LINE_HEIGHT_OPTIONS = [1, 1.15, 1.25, 1.4, 1.5, 1.6, 1.75, 2, 2.5]
const TEXT_LETTER_SPACING_OPTIONS = [-1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, 2, 3, 4]

function compactNumber(value: number): string {
  return String(Number(value.toFixed(2)))
}

function ImageAdjustmentControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onPreview,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  onPreview: (value: number | null) => void
  onChange: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  return (
    <div className="scripture-image-adjustment">
      <div className="scripture-image-adjustment-heading">
        <span>{label}</span>
        <output>{compactNumber(draftValue)}{unit}</output>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[draftValue]}
        aria-label={label}
        onValueChange={([next]) => {
          setDraftValue(next)
          onPreview(next)
        }}
        onValueCommit={([next]) => {
          onChange(next)
          onPreview(null)
        }}
      />
    </div>
  )
}

function ShapePreview({ shape }: { shape: ImageClipShape }) {
  const className = 'scripture-shape-select-preview size-4'
  if (shape === 'circle') return <CircleIcon className={className} aria-hidden="true" />
  if (shape === 'ellipse') return <CircleIcon className={`${className} is-ellipse`} aria-hidden="true" />
  if (shape === 'triangle') return <TriangleIcon className={className} aria-hidden="true" />
  if (shape === 'diamond') return <DiamondIcon className={className} aria-hidden="true" />
  if (shape === 'hexagon') return <HexagonIcon className={className} aria-hidden="true" />
  if (shape === 'star') return <StarIcon className={className} aria-hidden="true" />
  return <RectangleHorizontal className={className} aria-hidden="true" />
}

function TextMetricPicker({
  value,
  options,
  min,
  max,
  step,
  unit,
  ariaLabel,
  onChange,
  mixed = false,
}: {
  value: number
  options: number[]
  min: number
  max: number
  step: number
  unit: string
  ariaLabel: string
  onChange: (value: number) => void
  mixed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const externalDraft = mixed ? '' : compactNumber(value)
  const [draft, setDraft] = useState(() => externalDraft)
  const [lastExternalDraft, setLastExternalDraft] = useState(() => externalDraft)
  if (externalDraft !== lastExternalDraft) {
    setLastExternalDraft(externalDraft)
    setDraft(externalDraft)
  }

  const applyDraft = (next: string) => {
    setDraft(next)
    const parsed = Number(next)
    if (next.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed)
    }
  }

  const commitDraft = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(mixed ? '' : compactNumber(value))
      return
    }
    const next = Math.min(max, Math.max(min, parsed))
    setDraft(compactNumber(next))
    if (next !== value) onChange(next)
  }

  return (
    <div className="scripture-text-metric-picker">
      <input
        className="scripture-text-metric-input"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        placeholder={mixed ? 'Mixed' : undefined}
        aria-label={ariaLabel}
        onChange={(event) => applyDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(mixed ? '' : compactNumber(value))
            event.currentTarget.blur()
          }
        }}
      />
      <Popover open={open} onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(mixed ? '' : compactNumber(value))
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="scripture-text-metric-chevron"
            aria-label={`${ariaLabel} presets`}
          >
            <ChevronDown />
          </button>
        </PopoverTrigger>
        <PopoverContent className="scripture-text-metric-popover" align="end" sideOffset={4}>
          <div className="scripture-text-metric-options">
            {options.map((option) => (
              <button
                type="button"
                key={option}
                className="scripture-text-metric-option"
                data-selected={!mixed && Math.abs(option - value) < 0.001 || undefined}
                onClick={() => {
                  onChange(option)
                  setDraft(compactNumber(option))
                  setOpen(false)
                }}
              >
                {compactNumber(option)}{unit}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

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

    // Sections can appear after mount (e.g. "Page numbers" only renders once
    // enabled), so headings are (re)initialized on every DOM change inside
    // the card, not just once -- otherwise a section that shows up later
    // never gets its collapse handlers wired up. Re-running is safe: it
    // just reapplies whatever localStorage already says, which toggle()
    // below keeps in sync as soon as the user interacts.
    function initHeadings() {
      if (!card) return
      for (const heading of card.querySelectorAll<HTMLHeadingElement>('.scripture-inspector-section > h3')) {
        const section = heading.parentElement
        if (!section) continue
        const key = `scripture:inspector-section:${context}:${heading.textContent?.trim() || 'section'}`
        const storedPreference = localStorage.getItem(key)
        const collapsed = storedPreference == null
          ? section.hasAttribute('data-default-collapsed')
          : storedPreference === 'true'
        section.classList.toggle('is-collapsed', collapsed)
        heading.tabIndex = 0
        heading.setAttribute('role', 'button')
        heading.setAttribute('aria-expanded', String(!collapsed))
        heading.dataset.preferenceKey = key
      }
    }

    initHeadings()
    const observer = new MutationObserver(initHeadings)
    observer.observe(card, { childList: true, subtree: true })
    return () => observer.disconnect()
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

function SizeSection({
  node,
  docId,
  bare,
}: {
  node: LayoutNode
  docId: string
  // Skips the own heading/section wrapper so the Size controls can be
  // embedded inline in another section (the root Canvas section folds
  // Size into itself instead of giving it a separate header).
  bare?: boolean
}) {
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
  const updateSize = (size: { width?: number; height?: number }) => {
    updateNodeSize(doc, node.id, size)
    if (node.id === ROOT_ID) updateFrameProps(doc, node.id, { canvasSizeMode: 'custom' })
  }
  const content = (
    <>
      {!bare && <h3>Size</h3>}
      <div className="scripture-inspector-row">
        <IconField
          icon={<MoveHorizontal size={14} />}
          title="Width"
          value={node.width ?? autoWidth}
          min={MIN_NODE_SIZE}
          onChange={(width) => updateSize({ width })}
        />
        <IconField
          icon={<MoveVertical size={14} />}
          title="Height"
          value={node.height ?? autoHeight}
          min={MIN_NODE_SIZE}
          onChange={(height) => updateSize({ height })}
        />
      </div>
      {hasCustomSize && (
        <Button variant="ghost" size="sm" onClick={() => {
          updateNodeSize(doc, node.id, { width: null, height: null })
          if (node.id === ROOT_ID) updateFrameProps(doc, node.id, { canvasSizeMode: 'auto' })
        }}>
          Reset to auto
        </Button>
      )}
      <p className="scripture-inspector-hint">Drag the handles on a selected block&apos;s edges/corner to resize.</p>
    </>
  )
  if (bare) return content
  return <div className="scripture-inspector-section">{content}</div>
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
              <div className="scripture-inspector-align-rows">
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

interface TextTypographyDefaults {
  family: string
  source: TextFontSource
  size: number
  lineHeight: number
  letterSpacing: number
}

interface TextTypographySummary {
  family: string
  source: TextFontSource
  size: number
  lineHeight: number
  letterSpacing: number
  familyMixed: boolean
  sizeMixed: boolean
  lineHeightMixed: boolean
  letterSpacingMixed: boolean
  hasSelection: boolean
}

function numericFormatValue(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function summarizeTypographyValues(
  values: Array<{
    family: string
    source: TextFontSource
    size: number
    lineHeight: number
    letterSpacing: number
  }>,
  defaults: TextTypographyDefaults,
  hasSelection: boolean
): TextTypographySummary {
  const resolved = values.length > 0 ? values : [{
    family: defaults.family,
    source: defaults.source,
    size: defaults.size,
    lineHeight: defaults.lineHeight * defaults.size,
    letterSpacing: defaults.letterSpacing,
  }]
  const families = new Set(resolved.map((value) => `${value.source}\u0000${value.family}`))
  const sizes = new Set(resolved.map((value) => value.size))
  const lineHeights = new Set(resolved.map((value) => value.lineHeight))
  const letterSpacings = new Set(resolved.map((value) => value.letterSpacing))
  const first = resolved[0]

  return {
    ...first,
    familyMixed: families.size > 1,
    sizeMixed: sizes.size > 1,
    lineHeightMixed: lineHeights.size > 1,
    letterSpacingMixed: letterSpacings.size > 1,
    hasSelection,
  }
}

function effectiveTypography(
  attributes: Record<string, unknown> | undefined,
  defaults: TextTypographyDefaults
) {
  const family = typeof attributes?.fontFamily === 'string' ? attributes.fontFamily : defaults.family
  const source = attributes?.fontSource === 'google' || attributes?.fontSource === 'local' || attributes?.fontSource === 'system'
    ? attributes.fontSource
    : defaults.source
  const size = numericFormatValue(attributes?.fontSize) ?? defaults.size
  return {
    family,
    source,
    size,
    lineHeight: numericFormatValue(attributes?.lineHeight) ?? defaults.lineHeight * size,
    letterSpacing: numericFormatValue(attributes?.letterSpacing) ?? defaults.letterSpacing,
  }
}

function summarizeEditorTypography(
  editor: Editor,
  defaults: TextTypographyDefaults
): TextTypographySummary {
  const { doc, selection } = editor.state
  const hasSelection = !selection.empty
  const from = hasSelection ? selection.from : 0
  const to = hasSelection ? selection.to : doc.content.size
  const values: ReturnType<typeof effectiveTypography>[] = []

  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    const format = node.marks.find((mark) => mark.type.name === 'format')
    values.push(effectiveTypography(format?.attrs, defaults))
  })
  return summarizeTypographyValues(values, defaults, hasSelection)
}

function summarizeStaticTypography(
  document: JSONContent | null,
  defaults: TextTypographyDefaults
): TextTypographySummary {
  const values: ReturnType<typeof effectiveTypography>[] = []
  const visit = (node: JSONContent) => {
    if (node.type === 'text') {
      const format = node.marks?.find((mark) => mark.type === 'format')
      values.push(effectiveTypography(format?.attrs, defaults))
    }
    node.content?.forEach(visit)
  }
  if (document) visit(document)
  return summarizeTypographyValues(values, defaults, false)
}

function clearEditorFormatAttributes(editor: Editor, attributes: string[]) {
  const formatType = editor.schema.marks.format
  if (!formatType) return
  const transaction = editor.state.tr

  editor.state.doc.descendants((node, position) => {
    if (!node.isText) return
    const mark = node.marks.find((candidate) => candidate.type === formatType)
    if (!mark) return
    const nextAttributes = { ...mark.attrs }
    for (const attribute of attributes) nextAttributes[attribute] = null
    transaction.removeMark(position, position + node.nodeSize, mark)
    if (Object.values(nextAttributes).some((value) => value != null)) {
      transaction.addMark(position, position + node.nodeSize, formatType.create(nextAttributes))
    }
  })

  const storedMarks = editor.state.storedMarks
  if (storedMarks) {
    transaction.setStoredMarks(storedMarks.flatMap((mark) => {
      if (mark.type !== formatType) return [mark]
      const nextAttributes = { ...mark.attrs }
      for (const attribute of attributes) nextAttributes[attribute] = null
      return Object.values(nextAttributes).some((value) => value != null)
        ? [formatType.create(nextAttributes)]
        : []
    }))
  }

  if (transaction.docChanged || transaction.storedMarksSet) editor.view.dispatch(transaction)
}

function withCurrentOption(options: number[], value: number, mixed: boolean): number[] {
  if (mixed || options.some((option) => Math.abs(option - value) < 0.001)) return options
  return [...options, value].sort((a, b) => a - b)
}

function TextTypographyControls({
  docId,
  blockId,
  defaults,
}: {
  docId: string
  blockId: string
  defaults: TextTypographyDefaults
}) {
  const registry = useEditorRegistry()
  const editor = useSyncExternalStore(
    registry.subscribe,
    () => registry.getAll().get(blockId) ?? null,
    () => null
  )
  const entry = getYDoc(docId)
  const fragment = entry.doc.getXmlFragment(blockFragmentName(blockId))
  const serializedDocument = useSyncExternalStore(
    (listener) => {
      const observer = () => listener()
      fragment.observeDeep(observer)
      return () => fragment.unobserveDeep(observer)
    },
    () => JSON.stringify(staticBlockJSON(fragment)),
    () => ''
  )
  const liveSummary = useEditorState({
    editor,
    selector: ({ editor: current }) => current
      ? summarizeEditorTypography(current, defaults)
      : null,
  })
  let staticDocument: JSONContent | null = null
  if (serializedDocument) {
    try {
      staticDocument = JSON.parse(serializedDocument) as JSONContent
    } catch {
      staticDocument = null
    }
  }
  const summary = liveSummary ?? summarizeStaticTypography(staticDocument, defaults)
  const metricFontSize = summary.sizeMixed ? defaults.size : summary.size
  const fontSizeOptions = withCurrentOption(TEXT_FONT_SIZE_OPTIONS, summary.size, summary.sizeMixed)
  const lineHeightOptions = withCurrentOption(
    TEXT_LINE_HEIGHT_OPTIONS.map((height) => Number((height * metricFontSize).toFixed(2))),
    summary.lineHeight,
    summary.lineHeightMixed
  )
  const letterSpacingOptions = withCurrentOption(
    TEXT_LETTER_SPACING_OPTIONS,
    summary.letterSpacing,
    summary.letterSpacingMixed
  )

  const clearWholeBlockAttributes = (attributes: string[]) => {
    if (editor) clearEditorFormatAttributes(editor, attributes)
    else clearFormatAttributesInStaticBlock(fragment, attributes)
  }
  const applyFont = (family: string, source: TextFontSource) => {
    if (editor && summary.hasSelection) {
      editor.chain().setFontFamily(family, source).run()
      return
    }
    updateTextProps(entry.doc, blockId, { textFontFamily: family, textFontSource: source })
    clearWholeBlockAttributes(['fontFamily', 'fontSource'])
  }
  const applyFontSize = (value: number) => {
    if (editor && summary.hasSelection) {
      editor.chain().setFontSize(`${value}px`).run()
      return
    }
    updateTextProps(entry.doc, blockId, { textFontSize: value })
    clearWholeBlockAttributes(['fontSize'])
  }
  const applyLineHeight = (value: number) => {
    if (editor && summary.hasSelection) {
      editor.chain().setLineHeight(`${value}px`).run()
      return
    }
    updateTextProps(entry.doc, blockId, {
      textLineHeight: Number((value / defaults.size).toFixed(4)),
    })
    clearWholeBlockAttributes(['lineHeight'])
  }
  const applyLetterSpacing = (value: number) => {
    if (editor && summary.hasSelection) {
      editor.chain().setLetterSpacing(`${value}px`).run()
      return
    }
    updateTextProps(entry.doc, blockId, { textLetterSpacing: value })
    clearWholeBlockAttributes(['letterSpacing'])
  }

  return (
    <>
      <div className="scripture-inspector-stack">
        <Label>Font</Label>
        <FontPicker
          value={{ family: summary.family, source: summary.source }}
          mixed={summary.familyMixed}
          onChange={(font) => applyFont(font.family, font.source)}
        />
      </div>
      <div className="scripture-text-metrics" aria-label="Text size, line height, and letter spacing">
        <div className="scripture-text-metric">
          <Type aria-hidden="true" />
          <TextMetricPicker
            value={summary.size}
            options={fontSizeOptions}
            min={8}
            max={512}
            step={1}
            unit="px"
            ariaLabel="Font size"
            mixed={summary.sizeMixed}
            onChange={applyFontSize}
          />
        </div>
        <div className="scripture-text-metric">
          <MoveVertical aria-hidden="true" />
          <TextMetricPicker
            value={summary.lineHeight}
            options={lineHeightOptions}
            min={Number((metricFontSize * 0.5).toFixed(2))}
            max={Number((metricFontSize * 4).toFixed(2))}
            step={0.5}
            unit="px"
            ariaLabel="Line height"
            mixed={summary.lineHeightMixed}
            onChange={applyLineHeight}
          />
        </div>
        <div className="scripture-text-metric">
          <MoveHorizontal aria-hidden="true" />
          <TextMetricPicker
            value={summary.letterSpacing}
            options={letterSpacingOptions}
            min={-20}
            max={100}
            step={0.1}
            unit="px"
            ariaLabel="Letter spacing"
            mixed={summary.letterSpacingMixed}
            onChange={applyLetterSpacing}
          />
        </div>
      </div>
    </>
  )
}

function PageNumberTypographyControls({
  settings,
  onChange,
}: {
  settings: PageNumberSettings
  onChange: (settings: PageNumberSettings) => void
}) {
  const typography = settings.typography
  const absoluteLineHeight = Number((typography.lineHeight * typography.fontSize).toFixed(2))
  const fontSizeOptions = withCurrentOption(TEXT_FONT_SIZE_OPTIONS, typography.fontSize, false)
  const lineHeightOptions = withCurrentOption(
    TEXT_LINE_HEIGHT_OPTIONS.map((height) => Number((height * typography.fontSize).toFixed(2))),
    absoluteLineHeight,
    false
  )
  const letterSpacingOptions = withCurrentOption(TEXT_LETTER_SPACING_OPTIONS, typography.letterSpacing, false)
  const updateTypography = (patch: Partial<PageNumberTypography>) => {
    onChange({ ...settings, typography: { ...typography, ...patch } })
  }

  return (
    <>
      <div className="scripture-inspector-stack">
        <Label>Font</Label>
        <FontPicker
          value={{ family: typography.fontFamily, source: typography.fontSource }}
          onChange={(font) => updateTypography({ fontFamily: font.family, fontSource: font.source })}
        />
      </div>
      <div className="scripture-text-metrics" aria-label="Page number size, line height, and letter spacing">
        <div className="scripture-text-metric">
          <Type aria-hidden="true" />
          <TextMetricPicker
            value={typography.fontSize}
            options={fontSizeOptions}
            min={8}
            max={512}
            step={1}
            unit="px"
            ariaLabel="Page number font size"
            onChange={(fontSize) => updateTypography({ fontSize })}
          />
        </div>
        <div className="scripture-text-metric">
          <MoveVertical aria-hidden="true" />
          <TextMetricPicker
            value={absoluteLineHeight}
            options={lineHeightOptions}
            min={Number((typography.fontSize * 0.5).toFixed(2))}
            max={Number((typography.fontSize * 4).toFixed(2))}
            step={0.5}
            unit="px"
            ariaLabel="Page number line height"
            onChange={(lineHeight) => updateTypography({
              lineHeight: Number((lineHeight / typography.fontSize).toFixed(4)),
            })}
          />
        </div>
        <div className="scripture-text-metric">
          <MoveHorizontal aria-hidden="true" />
          <TextMetricPicker
            value={typography.letterSpacing}
            options={letterSpacingOptions}
            min={-20}
            max={100}
            step={0.1}
            unit="px"
            ariaLabel="Page number letter spacing"
            onChange={(letterSpacing) => updateTypography({ letterSpacing })}
          />
        </div>
      </div>
      <div className="scripture-inspector-stack">
        <Label>Style</Label>
        <div className="scripture-inline-format-controls">
          <FontWeightPicker
            value={typography.fontWeight}
            fontFamily={typography.fontFamily}
            fontSource={typography.fontSource}
            onChange={(fontWeight) => updateTypography({ fontWeight })}
          >
            <Toggle
              variant="outline"
              size="sm"
              pressed={typography.fontWeight >= 600}
              onPressedChange={(pressed) => updateTypography({ fontWeight: pressed ? 700 : 400 })}
              aria-label="Bold page number"
            >
              <Bold />
            </Toggle>
          </FontWeightPicker>
          <Toggle
            variant="outline"
            size="sm"
            pressed={typography.fontStyle === 'italic'}
            onPressedChange={(pressed) => updateTypography({ fontStyle: pressed ? 'italic' : 'normal' })}
            aria-label="Italic page number"
          >
            <Italic />
          </Toggle>
          <Toggle
            variant="outline"
            size="sm"
            pressed={typography.underline}
            onPressedChange={(underline) => updateTypography({ underline })}
            aria-label="Underline page number"
          >
            <Underline />
          </Toggle>
          <Toggle
            variant="outline"
            size="sm"
            pressed={typography.strike}
            onPressedChange={(strike) => updateTypography({ strike })}
            aria-label="Strikethrough page number"
          >
            <Strikethrough />
          </Toggle>
          <ColorPicker
            label="Text color"
            value={typography.textColor === 'currentColor' ? null : typography.textColor}
            presets={TEXT_COLOR_PRESETS}
            allowAlpha={false}
            onChange={(textColor) => updateTypography({ textColor })}
            onClear={() => updateTypography({ textColor: 'currentColor' })}
          />
          <ColorPicker
            label="Highlight color"
            value={typography.highlightColor}
            presets={HIGHLIGHT_PRESETS}
            allowAlpha
            onChange={(highlightColor) => updateTypography({ highlightColor })}
            onClear={() => updateTypography({ highlightColor: null })}
          />
        </div>
        <p className="scripture-inspector-hint">Right-click Bold to choose an exact font weight.</p>
      </div>
    </>
  )
}

function PageNumberStyleView({
  settings,
  previewText,
  onChange,
  onBack,
}: {
  settings: PageNumberSettings
  previewText: string
  onChange: (settings: PageNumberSettings) => void
  onBack: () => void
}) {
  const typography = settings.typography
  return (
    <Card className="scripture-inspector scripture-inspector-subview" size="sm">
      <CardContent className="flex flex-col">
        <div className="scripture-inspector-subview-header">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to canvas settings">
            <ArrowLeft />
          </Button>
          <strong>Page number appearance</strong>
        </div>
        <GoogleFontLoader families={typography.fontSource === 'google' ? [typography.fontFamily] : []} />
        <div className="scripture-page-number-style-preview" aria-label="Page number style preview">
          <div className="scripture-page-number-style-samples">
            {(['light', 'dark'] as const).map((surface) => (
              <div key={surface} className={`scripture-page-number-style-sample is-${surface}`}>
                <span
                  data-highlighted={typography.highlightColor ? '' : undefined}
                  style={pageNumberTypographyStyle(typography)}
                  aria-hidden={surface === 'dark'}
                >
                  {previewText}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="scripture-page-number-style-controls">
          <div className="scripture-inspector-row">
            <Label>Numerals</Label>
            <Select
              value={settings.numeralStyle}
              onValueChange={(numeralStyle) => onChange({
                ...settings,
                numeralStyle: numeralStyle as PageNumberNumeralStyle,
              })}
            >
              <SelectTrigger className="w-36" size="sm" aria-label="Page number numeral style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent size="sm">
                <SelectItem value="arabic">Arabic · 1, 2, 3</SelectItem>
                <SelectItem value="roman">Roman · I, II, III</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="scripture-page-number-style-divider" />
          <PageNumberTypographyControls settings={settings} onChange={onChange} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => onChange({
            ...settings,
            typography: { ...DEFAULT_PAGE_NUMBER_TYPOGRAPHY },
          })}
        >
          <RemoveFormatting /> Reset number style
        </Button>
      </CardContent>
    </Card>
  )
}

function TextContentControls({
  blockId,
  onSetEditing,
  fontFamily,
  fontSource,
}: {
  blockId: string
  onSetEditing: (id: string) => void
  fontFamily: string
  fontSource: TextFontSource
}) {
  const registry = useEditorRegistry()
  const editor = useSyncExternalStore(
    registry.subscribe,
    () => registry.getAll().get(blockId) ?? null,
    () => null
  )
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return {
          list: '',
          block: 'paragraph',
          alignment: 'left' as const,
          bold: false,
          fontWeight: 400,
          italic: false,
          underline: false,
          strike: false,
          code: false,
          highlight: null as string | null,
          textColor: null as string | null,
          href: '',
          fontFamily,
          fontSource,
        }
      }
      const list = current.isActive('taskList')
        ? 'task'
        : current.isActive('orderedList')
          ? 'ordered'
          : current.isActive('bulletList')
            ? 'bullet'
            : ''
      const block = ([1, 2, 3] as const).find((level) => current.isActive('heading', { level }))
      const alignment = (['center', 'right', 'justify'] as const).find((value) =>
        current.isActive('paragraph', { textAlign: value }) || current.isActive('heading', { textAlign: value })
      ) ?? 'left'
      const format = current.getAttributes('format')
      const heading = current.isActive('heading')
      const parsedFontWeight = Number.parseInt(String(format.fontWeight), 10)
      const fontWeight = Number.isFinite(parsedFontWeight) ? parsedFontWeight : heading ? 700 : 400
      return {
        list,
        block: block ? `heading-${block}` : current.isActive('blockquote') ? 'quote' : 'paragraph',
        alignment,
        bold: current.isActive('bold') || fontWeight >= 600,
        fontWeight,
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
        highlight: typeof format.highlight === 'string' ? format.highlight : null,
        textColor: typeof format.textColor === 'string' ? format.textColor : null,
        href: (current.getAttributes('link').href as string | undefined) ?? '',
        fontFamily: typeof format.fontFamily === 'string' ? format.fontFamily : fontFamily,
        fontSource:
          format.fontSource === 'google' || format.fontSource === 'system'
            ? format.fontSource
            : fontSource,
      }
    },
  })

  if (!editor || !state) {
    return (
      <div className="scripture-inspector-stack">
        <Label>Content formatting</Label>
        <Button variant="outline" size="sm" onClick={() => onSetEditing(blockId)}>
          Edit text to format
        </Button>
        <p className="scripture-inspector-hint">
          Enter text editing, then place the caret or select paragraphs to format them here.
        </p>
      </div>
    )
  }

  const setBlock = (value: string) => {
    if (value === 'paragraph') editor.chain().focus().clearNodes().run()
    else if (value === 'quote') editor.chain().focus().toggleBlockquote().run()
    else {
      const level = Number(value.split('-')[1]) as 1 | 2 | 3
      editor.chain().focus().toggleHeading({ level }).run()
    }
  }
  const toggleList = (value: string) => {
    const target = value || state.list
    if (target === 'bullet') editor.chain().focus().toggleBulletList().run()
    else if (target === 'ordered') editor.chain().focus().toggleOrderedList().run()
    else if (target === 'task') editor.chain().focus().toggleTaskList().run()
  }
  const listItemType = state.list === 'task' ? 'taskItem' : 'listItem'

  return (
    <div className="scripture-inspector-section">
      <h3>Content formatting</h3>

      <div className="scripture-inspector-row">
        <Label>Paragraph</Label>
        <Select value={state.block} onValueChange={setBlock}>
          <SelectTrigger className="w-36" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent size="sm">
            <SelectItem value="paragraph">Paragraph</SelectItem>
            <SelectItem value="heading-1">Heading 1</SelectItem>
            <SelectItem value="heading-2">Heading 2</SelectItem>
            <SelectItem value="heading-3">Heading 3</SelectItem>
            <SelectItem value="quote">Quote</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="scripture-inspector-stack">
        <Label>Style</Label>
        <div className="scripture-inline-format-controls">
          <InlineFormattingControls editor={editor} kind="text" state={state} />
        </div>
        <p className="scripture-inspector-hint">
          Right-click Bold to choose a font weight.
        </p>
      </div>

      <div className="scripture-inspector-stack">
        <Label>List</Label>
        <div className="scripture-list-controls">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={state.list}
            onValueChange={toggleList}
            className="scripture-list-type-controls"
          >
            <ToggleGroupItem value="bullet" className="flex-1" aria-label="Bulleted list"><List /></ToggleGroupItem>
            <ToggleGroupItem value="ordered" className="flex-1" aria-label="Numbered list"><ListOrdered /></ToggleGroupItem>
            <ToggleGroupItem value="task" className="flex-1" aria-label="Task list"><ListChecks /></ToggleGroupItem>
          </ToggleGroup>
          <span className="scripture-list-divider" aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!state.list}
                onClick={() => editor.chain().focus().liftListItem(listItemType).run()}
                aria-label="Outdent"
              >
                <IndentDecrease />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Outdent</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!state.list}
                onClick={() => editor.chain().focus().sinkListItem(listItemType).run()}
                aria-label="Indent"
              >
                <IndentIncrease />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Indent</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="scripture-inspector-stack">
        <Label>Alignment</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={state.alignment}
          onValueChange={(value) => value && editor.chain().focus().setTextAlign(value as 'left' | 'center' | 'right' | 'justify').run()}
          className="w-full"
        >
          <ToggleGroupItem value="left" className="flex-1" aria-label="Align left"><AlignLeft /></ToggleGroupItem>
          <ToggleGroupItem value="center" className="flex-1" aria-label="Align center"><AlignCenter /></ToggleGroupItem>
          <ToggleGroupItem value="right" className="flex-1" aria-label="Align right"><AlignRight /></ToggleGroupItem>
          <ToggleGroupItem value="justify" className="flex-1" aria-label="Justify"><AlignJustify /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p className="scripture-inspector-hint">
        Paragraph controls apply at the caret or across the current text selection.
      </p>
      <div className="scripture-clear-formatting-action">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="w-full justify-start">
              <RemoveFormatting /> Clear selection formatting
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Clear selection formatting?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes inline styles and resets paragraph formatting for the current selection. You can undo it afterward.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              >
                Clear formatting
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
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
  onSetEditing,
  pageNumberSettings,
  onPageNumberSettingsChange,
  pageIds,
  pageNames,
  onImageEffectPreviewChange,
}: InspectorPanelProps) {
  const { measureAll } = useGeometryActions()
  const exportQuality = useExportQuality()
  const exportMargin = useExportMargin()
  const transparentExport = useTransparentExport()
  const [pageNumberStyleOpen, setPageNumberStyleOpen] = useState(false)
  // Only ever read/set from the image-block branch below, but this whole
  // component is one big function with many early returns per node.kind --
  // hooks have to sit here, above all of them, or the hook-call order
  // breaks the moment the selection switches kind.
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null)
  const replaceImageInputRef = useRef<HTMLInputElement>(null)
  const [replacingImage, setReplacingImage] = useState(false)
  const [replaceImageError, setReplaceImageError] = useState<string | null>(null)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const backgroundRemoval = useBackgroundRemovalState(docId, selectedId)
  // Same hook-ordering constraint as the state above: `node` has to be
  // resolved up here, before any early return, so this can sit alongside
  // the other unconditional hooks. `node.src` is a `local:{id}` reference
  // into IndexedDB (see image-block.tsx), not a directly loadable URL --
  // the crop dialog needs the same resolved blob: URL the canvas itself
  // renders, or it just fails to load the image.
  const node = selectedId ? findNode(tree, selectedId) : tree
  const cropDialogSrc = useLocalImageSrc(node?.kind === 'image' ? node.src : undefined)

  useEffect(() => () => onImageEffectPreviewChange(null), [onImageEffectPreviewChange, selectedId])

  if (selectedIds.length > 1) {
    return (
      <MultiSelectPanel docId={docId} tree={tree} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
    )
  }

  if (!node) return null

  const { doc } = getYDoc(docId)

  if (node.kind === 'frame') {
    const childLayout: ChildLayout = node.childLayout ?? 'flex'
    const isCanvasFrame = childLayout === 'canvas'
    const canUngroup = isCanvasFrame && node.id !== ROOT_ID
    const configuredStartPageId = pageNumberSettings.startPageId
    const startPageId = configuredStartPageId && pageIds.includes(configuredStartPageId)
      ? configuredStartPageId
      : (pageIds[0] ?? null)
    const startPageIndex = startPageId ? pageIds.indexOf(startPageId) : 0
    const currentPageIndex = pageIds.indexOf(docId)
    const currentPageBeforeStart = currentPageIndex >= 0 && currentPageIndex < startPageIndex
    const currentPageHidden = pageNumberSettings.hiddenPageIds.includes(docId)
    const generatedPageNumber = currentPageIndex >= startPageIndex
      ? formatPageNumber(currentPageIndex - startPageIndex + 1, pageNumberSettings)
      : 'Not numbered'
    const stylePreviewText = currentPageIndex >= startPageIndex
      ? generatedPageNumber
      : formatPageNumber(1, pageNumberSettings)
    if (node.id === ROOT_ID && pageNumberStyleOpen) {
      return (
        <PageNumberStyleView
          settings={pageNumberSettings}
          previewText={stylePreviewText}
          onChange={onPageNumberSettingsChange}
          onBack={() => setPageNumberStyleOpen(false)}
        />
      )
    }
    return (
      <InspectorCard context={node.id === ROOT_ID ? 'canvas' : 'frame'}>
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>{node.id === ROOT_ID ? 'Canvas' : 'Frame'}</h3>

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

            <Separator />

            {/* Layout mode comes first among the behavioral controls -- it's
                the one decision that determines whether anything below even
                applies (canvas-mode children are freely positioned, not
                flowed, so none of the flex controls matter there). Everything
                else follows this,
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

            {node.id === ROOT_ID && (
              <>
                <Separator />
                <div className="scripture-inspector-row">
                  <Label>Format</Label>
                  <Select
                    value={canvasSizePresetValue(node)}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        updateFrameProps(doc, node.id, { pageSize: 'content', canvasSizeMode: 'custom' })
                        return
                      }
                      const preset = CANVAS_SIZE_PRESETS.find((candidate) => candidate.value === value)
                      if (!preset) return
                      updateFrameProps(doc, node.id, {
                        pageSize: 'content',
                        canvasSizeMode: value as CanvasSizeMode,
                      })
                      updateNodeSize(
                        doc,
                        node.id,
                        value === 'auto'
                          ? { width: null, height: null }
                          : { width: preset.width, height: preset.height }
                      )
                    }}
                  >
                    <SelectTrigger className="w-40" size="sm" aria-label="Canvas format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent size="sm">
                      {CANVAS_SIZE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="export-sized" disabled>Controlled by export</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="scripture-inspector-hint">
                  Presets resize the artboard and use that same shape for content-sized exports. Fine-tune the exact
                  dimensions below.
                </p>
                {(node.pageSize ?? 'content') === 'content' && (
                  <SizeSection node={node} docId={docId} bare />
                )}
                <Separator />
                <div className="scripture-inspector-row">
                  <Label>Page numbers</Label>
                  <Switch
                    checked={pageNumberSettings.enabled}
                    onCheckedChange={(enabled) =>
                      onPageNumberSettingsChange({ ...pageNumberSettings, enabled })
                    }
                    aria-label="Show page numbers"
                  />
                </div>
              </>
            )}
          </div>

          {node.id === ROOT_ID && pageNumberSettings.enabled && (
            <>
              <Separator />
              <div className="scripture-inspector-section">
                <h3>Page numbers</h3>
                <div className="scripture-inspector-row">
                  <Label>Show on this page</Label>
                  <Switch
                    checked={!currentPageBeforeStart && !currentPageHidden}
                    disabled={currentPageBeforeStart}
                    onCheckedChange={(visible) => {
                      const hiddenPageIds = visible
                        ? pageNumberSettings.hiddenPageIds.filter((pageId) => pageId !== docId)
                        : [...new Set([...pageNumberSettings.hiddenPageIds, docId])]
                      onPageNumberSettingsChange({ ...pageNumberSettings, hiddenPageIds })
                    }}
                    aria-label="Show page number on this page"
                  />
                </div>
                {currentPageBeforeStart && (
                  <p className="scripture-inspector-hint">This page is before the numbering start page.</p>
                )}
                <div className="scripture-inspector-stack">
                  <Label>Start numbering on</Label>
                  <Select
                    value={startPageId ?? ''}
                    onValueChange={(nextStartPageId) => onPageNumberSettingsChange({
                      ...pageNumberSettings,
                      startPageId: nextStartPageId,
                    })}
                  >
                    <SelectTrigger className="w-full" size="sm" aria-label="Page numbering start page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent size="sm">
                      {pageIds.map((pageId, index) => (
                        <SelectItem key={pageId} value={pageId}>
                          {index + 1}. {pageNames[pageId] || 'Untitled'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="scripture-inspector-stack">
                  <Label>Vertical position</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    className="w-full"
                    value={pageNumberSettings.vertical}
                    onValueChange={(vertical) =>
                      vertical && onPageNumberSettingsChange({
                        ...pageNumberSettings,
                        vertical: vertical as PageNumberVerticalPosition,
                      })
                    }
                    aria-label="Page number vertical position"
                  >
                    <ToggleGroupItem value="top" className="flex-1">Top</ToggleGroupItem>
                    <ToggleGroupItem value="bottom" className="flex-1">Bottom</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="scripture-inspector-stack">
                  <Label>Horizontal position</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    className="w-full"
                    value={pageNumberSettings.horizontal}
                    onValueChange={(horizontal) =>
                      horizontal && onPageNumberSettingsChange({
                        ...pageNumberSettings,
                        horizontal: horizontal as PageNumberHorizontalPosition,
                      })
                    }
                    aria-label="Page number horizontal position"
                  >
                    <IconTab value="left" label="Left">
                      <AlignLeft />
                    </IconTab>
                    <IconTab value="center" label="Center">
                      <AlignCenter />
                    </IconTab>
                    <IconTab value="right" label="Right">
                      <AlignRight />
                    </IconTab>
                  </ToggleGroup>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="scripture-page-number-appearance-button"
                  onClick={() => setPageNumberStyleOpen(true)}
                >
                  <Type />
                  Edit appearance…
                </Button>
                <p className="scripture-inspector-hint">
                  The start page is 1 or I. Hidden pages keep their place in the count, and numbering is included in previews and exports.
                </p>
              </div>
            </>
          )}

          {/* Root's Size controls live inside the Canvas section above
              (folded in with Format); this is only for non-root frames. */}
          {node.id !== ROOT_ID && (
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
                      updateFrameProps(doc, node.id, {
                        pageSize: v as PageSize,
                        ...(v !== 'content' ? { canvasSizeMode: 'auto' as const } : {}),
                      })
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
                    <SelectContent size="sm">
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
                <div className="scripture-inspector-row">
                  <Label>Save as</Label>
                  <div className="scripture-inspector-actions">
                    <Button
                      variant="default"
                      size="xs"
                      className="min-w-0 flex-1"
                      onClick={onExportPdf}
                      disabled={exporting !== null}
                    >
                      <Download />
                      {exporting === 'pdf' ? 'Saving…' : 'PDF'}
                    </Button>
                    <Button
                      variant="default"
                      size="xs"
                      className="min-w-0 flex-1"
                      onClick={onExportPng}
                      disabled={exporting !== null}
                    >
                      <Download />
                      {exporting === 'png' ? 'Saving…' : 'PNG'}
                    </Button>
                  </div>
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
    const clipShape = node.clipShape ?? 'none'
    const effects = normalizeImageEffects(node)
    const hasAdjustments = effects.opacity !== 100 || effects.brightness !== 100 || effects.contrast !== 100 ||
      effects.saturation !== 100 || effects.hue !== 0 || effects.grayscale !== 0 || effects.blur !== 0
    const imageNodeId = node.id

    function previewImageEffect(key: keyof typeof effects, value: number | null) {
      onImageEffectPreviewChange(value == null
        ? null
        : { nodeId: imageNodeId, effects: { ...effects, [key]: value } })
    }
    // Plain values, not `node` itself -- TS's `node.kind === 'image'`
    // narrowing (away from LayoutNode | null) doesn't carry into these
    // nested function declarations' bodies.
    const imageSrc = node.src

    async function handleRemoveBackground() {
      if (!imageSrc || backgroundRemoval?.status === 'running') return
      const previousSrc = imageSrc
      setBackgroundRemovalState(docId, {
        nodeId: imageNodeId,
        status: 'running',
        label: 'Starting background removal',
        detail: 'Preparing the on-device image model…',
        progress: 2,
      })
      let uploadedUrl: string | null = null
      try {
        const blob = await removeImageBackground(previousSrc, (label, current, total) => {
          const previousProgress = getBackgroundRemovalState(docId, imageNodeId)?.progress ?? 0
          const friendly = friendlyBackgroundProgress(label, current, total, previousProgress)
          setBackgroundRemovalState(docId, {
            nodeId: imageNodeId,
            status: 'running',
            ...friendly,
          })
        })
        setBackgroundRemovalState(docId, {
          nodeId: imageNodeId,
          status: 'running',
          label: 'Saving result',
          detail: 'Adding the transparent image to your document.',
          progress: 99,
        })
        uploadedUrl = await uploadImageFile(blob, 'background-removed.png')

        // Long-running model work can finish after the layer was removed or
        // its image was replaced. Never overwrite that newer user action.
        const currentTree = toPlainTree(doc)
        const currentNode = currentTree ? findNode(currentTree, imageNodeId) : null
        if (!currentNode || currentNode.kind !== 'image' || currentNode.src !== previousSrc) {
          await deleteUploadedImage(uploadedUrl)
          clearBackgroundRemovalState(docId, imageNodeId)
          return
        }

        updateImageProps(doc, imageNodeId, {
          src: uploadedUrl,
          retainedSources: Array.from(new Set([...(currentNode.retainedSources ?? []), previousSrc])),
        })
        setBackgroundRemovalState(docId, {
          nodeId: imageNodeId,
          status: 'success',
          label: 'Background removed',
          detail: 'The transparent image is ready.',
          progress: 100,
        })
        window.setTimeout(() => {
          if (getBackgroundRemovalState(docId, imageNodeId)?.status === 'success') {
            clearBackgroundRemovalState(docId, imageNodeId)
          }
        }, 2500)
      } catch (err) {
        console.error('Background removal failed', err)
        if (uploadedUrl) void deleteUploadedImage(uploadedUrl).catch(() => undefined)
        setBackgroundRemovalState(docId, {
          nodeId: imageNodeId,
          status: 'error',
          label: 'Background removal failed',
          detail: err instanceof Error ? err.message : 'Try again in a moment.',
          progress: null,
        })
      }
    }

    async function handleReplaceImage(file: File) {
      if (!imageSrc || replacingImage) return
      setReplacingImage(true)
      setReplaceImageError(null)
      let uploadedUrl: string | null = null
      try {
        uploadedUrl = await uploadImageFile(file)
        const currentTree = toPlainTree(doc)
        const currentNode = currentTree ? findNode(currentTree, imageNodeId) : null
        if (!currentNode || currentNode.kind !== 'image' || currentNode.src !== imageSrc) {
          await deleteUploadedImage(uploadedUrl)
          return
        }
        clearBackgroundRemovalState(docId, imageNodeId)
        updateImageProps(doc, imageNodeId, {
          src: uploadedUrl,
          cropX: 0,
          cropY: 0,
          cropWidth: 1,
          cropHeight: 1,
          intrinsicWidth: 0,
          intrinsicHeight: 0,
          retainedSources: Array.from(new Set([...(currentNode.retainedSources ?? []), imageSrc])),
        })
      } catch (cause) {
        console.error('Image replacement failed', cause)
        if (uploadedUrl) void deleteUploadedImage(uploadedUrl).catch(() => undefined)
        setReplaceImageError(cause instanceof Error ? cause.message : 'The replacement image could not be uploaded.')
      } finally {
        setReplacingImage(false)
      }
    }

    function handleApplyCrop(result: CropResult) {
      const crop = normalizeImageCrop(result)
      updateImageProps(doc, result.nodeId, {
        ...crop,
        intrinsicWidth: result.intrinsicWidth,
        intrinsicHeight: result.intrinsicHeight,
      })
      const currentTree = toPlainTree(doc)
      const targetNode = currentTree ? findNode(currentTree, result.nodeId) : null
      if (targetNode?.kind === 'image' && targetNode.width == null && targetNode.height == null) {
        const element = Array.from(document.querySelectorAll<HTMLElement>('[data-node-id]'))
          .find((candidate) => candidate.dataset.nodeId === result.nodeId)
        const size = croppedImageFrameSize({
          renderedWidth: element?.offsetWidth,
          renderedHeight: element?.offsetHeight,
          naturalWidth: result.intrinsicWidth,
          naturalHeight: result.intrinsicHeight,
          crop,
        })
        updateNodeSize(doc, result.nodeId, size)
      }
    }

    return (
      <InspectorCard context="image">
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>Image block</h3>
            <div className="scripture-inspector-stack">
              <Label>Alt text</Label>
              <Input
                value={node.alt ?? ''}
                placeholder="Describe the image"
                onChange={(e) => updateImageProps(doc, node.id, { alt: e.target.value })}
              />
            </div>
            {node.src && (
              <div className="scripture-image-actions">
                <input
                  ref={replaceImageInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void handleReplaceImage(file)
                  }}
                />
                <div className="scripture-image-action-grid">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!cropDialogSrc}
                    onClick={() =>
                      setCropRequest({
                        nodeId: node.id,
                        src: cropDialogSrc!,
                        cropX: node.cropX ?? 0,
                        cropY: node.cropY ?? 0,
                        cropWidth: node.cropWidth ?? 1,
                        cropHeight: node.cropHeight ?? 1,
                      })
                    }
                  >
                    <Crop /> Crop
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={replacingImage}
                    onClick={() => replaceImageInputRef.current?.click()}
                  >
                    {replacingImage ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                    Replace
                  </Button>
                </div>
                <Button
                  className="w-full"
                  variant="secondary"
                  size="sm"
                  disabled={backgroundRemoval?.status === 'running'}
                  onClick={handleRemoveBackground}
                >
                  {backgroundRemoval?.status === 'running' ? <LoaderCircle className="animate-spin" /> : <Eraser />}
                  {backgroundRemoval?.status === 'error' ? 'Try background removal again' : 'Remove background'}
                </Button>
                {replaceImageError && <p className="scripture-error-text" role="alert">{replaceImageError}</p>}
              </div>
            )}
          </div>

          <Separator />
          <div className="scripture-inspector-section">
            <h3>Adjustments</h3>
            <div className="scripture-image-adjustments">
              <ImageAdjustmentControl label="Opacity" value={effects.opacity} min={0} max={100} unit="%" onPreview={(value) => previewImageEffect('opacity', value)} onChange={(opacity) => updateImageProps(doc, node.id, { opacity })} />
              <ImageAdjustmentControl label="Brightness" value={effects.brightness} min={0} max={200} unit="%" onPreview={(value) => previewImageEffect('brightness', value)} onChange={(brightness) => updateImageProps(doc, node.id, { brightness })} />
              <ImageAdjustmentControl label="Contrast" value={effects.contrast} min={0} max={200} unit="%" onPreview={(value) => previewImageEffect('contrast', value)} onChange={(contrast) => updateImageProps(doc, node.id, { contrast })} />
              <ImageAdjustmentControl label="Saturation" value={effects.saturation} min={0} max={200} unit="%" onPreview={(value) => previewImageEffect('saturation', value)} onChange={(saturation) => updateImageProps(doc, node.id, { saturation })} />
              <ImageAdjustmentControl label="Hue" value={effects.hue} min={-180} max={180} unit="°" onPreview={(value) => previewImageEffect('hue', value)} onChange={(hue) => updateImageProps(doc, node.id, { hue })} />
              <ImageAdjustmentControl label="Grayscale" value={effects.grayscale} min={0} max={100} unit="%" onPreview={(value) => previewImageEffect('grayscale', value)} onChange={(grayscale) => updateImageProps(doc, node.id, { grayscale })} />
              <ImageAdjustmentControl label="Blur" value={effects.blur} min={0} max={20} step={0.5} unit="px" onPreview={(value) => previewImageEffect('blur', value)} onChange={(blur) => updateImageProps(doc, node.id, { blur })} />
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="scripture-image-reset-adjustments"
              disabled={!hasAdjustments}
              onClick={() => updateImageProps(doc, node.id, {
                opacity: 100,
                brightness: 100,
                contrast: 100,
                saturation: 100,
                hue: 0,
                grayscale: 0,
                blur: 0,
              })}
            >
              <RotateCcw /> Reset adjustments
            </Button>
          </div>

          <Separator />
          <div className="scripture-inspector-section is-collapsed" data-default-collapsed>
            <h3>Mask</h3>
            <div className="scripture-inspector-row">
              <Label>Shape</Label>
              <Select
                value={clipShape}
                onValueChange={(value) => updateImageProps(doc, node.id, { clipShape: value as ImageClipShape })}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent size="sm" className="scripture-shape-select-content">
                  {IMAGE_CLIP_SHAPES.map((shape) => (
                    <SelectItem className="scripture-shape-select-item" key={shape.value} value={shape.value}>
                      <ShapePreview shape={shape.value} />
                      {shape.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {clipShape === 'none' && (
              <div className="scripture-inspector-row">
                <Label>Corner radius</Label>
                <div className="w-20">
                  <IconField
                    icon={<RadiusIcon />}
                    title="Corner radius"
                    value={node.radius ?? 0}
                    onChange={(radius) => updateImageProps(doc, node.id, { radius })}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />
          <SizeSection node={node} docId={docId} />
        </CardContent>
        <ImageCropDialog
          request={cropRequest?.nodeId === node.id ? cropRequest : null}
          onOpenChange={(open) => !open && setCropRequest(null)}
          onApply={handleApplyCrop}
        />
      </InspectorCard>
    )
  }

  if (node.kind !== 'code') {
    const textFontSize = node.textFontSize ?? DEFAULT_TEXT_BLOCK_PROPS.textFontSize
    const textLineHeight = node.textLineHeight ?? DEFAULT_TEXT_BLOCK_PROPS.textLineHeight
    const textLetterSpacing = node.textLetterSpacing ?? DEFAULT_TEXT_BLOCK_PROPS.textLetterSpacing

    return (
      <InspectorCard context="text">
        <CardContent className="flex flex-col gap-5">
          <div className="scripture-inspector-section">
            <h3>Text block</h3>
            <TextTypographyControls
              docId={docId}
              blockId={node.id}
              defaults={{
                family: node.textFontFamily ?? DEFAULT_TEXT_BLOCK_PROPS.textFontFamily,
                source: node.textFontSource ?? DEFAULT_TEXT_BLOCK_PROPS.textFontSource,
                size: textFontSize,
                lineHeight: textLineHeight,
                letterSpacing: textLetterSpacing,
              }}
            />
            <p className="scripture-inspector-hint">
              Typography applies to selected text when there is a selection, or to the full block otherwise. Text and code fonts stay independent.
            </p>
          </div>
          <Separator />
          <TextContentControls
            blockId={node.id}
            onSetEditing={onSetEditing}
            fontFamily={node.textFontFamily ?? DEFAULT_TEXT_BLOCK_PROPS.textFontFamily}
            fontSource={node.textFontSource ?? DEFAULT_TEXT_BLOCK_PROPS.textFontSource}
          />
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
              <SelectContent size="sm">
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
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
