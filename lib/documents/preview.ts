'use client'

import type { JSONContent } from '@tiptap/core'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import type { LayoutNode } from '@/lib/layout/types'
import {
  resolveThemeArg,
  resolveThemeBackground,
} from '@/lib/presets/custom-syntax-themes'
import { getYDoc, blockFragmentName } from '@/lib/yjs/doc-store'
import { toPlainTree } from '@/lib/yjs/layout-store'
import { getDocumentMeta, type DocumentMeta } from './manifest'
import { tokenizeCodeInWorker } from '@/lib/shiki/client-tokenizer'
import type { SyntaxStyleRange } from '@/lib/shiki/token-types'
import { plainTextFromDocument } from '@/lib/tiptap/syntax-document'

const CACHE_VERSION = 2
const CACHE_PREFIX = 'scripture:document-preview:'
const PREVIEW_WIDTH = 640
const PREVIEW_HEIGHT = 400
const MAX_PREVIEW_LINES = 16
const MAX_LINE_CHARACTERS = 72

interface PreviewRun {
  text: string
  color?: string
  bold?: boolean
  italic?: boolean
}

type PreviewLines = PreviewRun[][]
type PreviewContent = Record<string, PreviewLines>

interface CachedPreview {
  version: number
  updatedAt: number
  dataUrl: string
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function cachedPreviewKey(docId: string): string {
  return `${CACHE_PREFIX}${docId}`
}

function readCachedPreview(meta: DocumentMeta): string | null {
  try {
    const raw = localStorage.getItem(cachedPreviewKey(meta.id))
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedPreview
    if (
      cached.version !== CACHE_VERSION ||
      cached.updatedAt !== meta.updatedAt ||
      typeof cached.dataUrl !== 'string'
    ) {
      return null
    }
    return cached.dataUrl
  } catch {
    return null
  }
}

function writeCachedPreview(meta: DocumentMeta, dataUrl: string) {
  try {
    const cached: CachedPreview = {
      version: CACHE_VERSION,
      updatedAt: meta.updatedAt,
      dataUrl,
    }
    localStorage.setItem(cachedPreviewKey(meta.id), JSON.stringify(cached))
  } catch {
    // Best effort. A real preview still displays for this session even when
    // storage is unavailable or full.
  }
}

export function clearDocumentPreview(docId: string) {
  try {
    localStorage.removeItem(cachedPreviewKey(docId))
  } catch {
    // Best effort; document deletion must not fail over a disposable cache.
  }
}

function colorFromMarks(node: JSONContent): string | undefined {
  const mark = node.marks?.find((candidate) => candidate.type === 'syntaxColor')
  const color = mark?.attrs?.color
  return typeof color === 'string' ? color : undefined
}

function extractPreviewLines(content: JSONContent): PreviewLines {
  const lines: PreviewLines = [[]]

  function appendText(text: string, run: Omit<PreviewRun, 'text'>) {
    const chunks = text.replace(/\r\n?/g, '\n').split('\n')
    chunks.forEach((chunk, index) => {
      if (lines.length > MAX_PREVIEW_LINES) return
      if (chunk) {
        const line = lines[lines.length - 1]
        const used = line.reduce((total, item) => total + item.text.length, 0)
        const remaining = Math.max(0, MAX_LINE_CHARACTERS - used)
        if (remaining > 0) line.push({ ...run, text: chunk.slice(0, remaining) })
      }
      if (index < chunks.length - 1 && lines.length < MAX_PREVIEW_LINES) lines.push([])
    })
  }

  function walk(node: JSONContent) {
    if (node.text) {
      appendText(node.text, {
        color: colorFromMarks(node),
        bold: node.marks?.some((mark) => mark.type === 'bold'),
        italic: node.marks?.some((mark) => mark.type === 'italic'),
      })
      return
    }
    node.content?.forEach(walk)
  }

  walk(content)
  return lines.slice(0, MAX_PREVIEW_LINES)
}

function syntaxRangesToPreview(text: string, ranges: SyntaxStyleRange[]): PreviewLines {
  const result: PreviewLines = []
  let lineStart = 0
  let rangeIndex = 0

  for (const line of text.split('\n').slice(0, MAX_PREVIEW_LINES)) {
    const visibleLength = Math.min(line.length, MAX_LINE_CHARACTERS)
    const lineEnd = lineStart + visibleLength
    const boundaries = new Set([lineStart, lineEnd])
    for (let index = rangeIndex; index < ranges.length; index += 1) {
      const range = ranges[index]
      if (range.from >= lineEnd) break
      if (range.to > lineStart) {
        boundaries.add(Math.max(lineStart, range.from))
        boundaries.add(Math.min(lineEnd, range.to))
      }
    }

    const points = [...boundaries].sort((left, right) => left - right)
    const runs: PreviewRun[] = []
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      while (ranges[rangeIndex] && ranges[rangeIndex].to <= from) rangeIndex += 1
      const range = ranges[rangeIndex]
      const style = range && range.from <= from && range.to >= to ? range : null
      if (to > from) {
        runs.push({
          text: text.slice(from, to),
          color: style?.color ?? undefined,
          bold: style?.bold,
          italic: style?.italic,
        })
      }
    }
    result.push(runs)
    lineStart += line.length + 1
  }
  return result
}

async function collectPreviewContent(
  tree: LayoutNode,
  doc: ReturnType<typeof getYDoc>['doc']
): Promise<PreviewContent> {
  const leaves: LayoutNode[] = []
  function visit(node: LayoutNode) {
    if (node.kind === 'code' || node.kind === 'text') leaves.push(node)
    node.children?.forEach(visit)
  }
  visit(tree)

  const entries = await Promise.all(
    leaves.map(async (node) => {
      const document = yXmlFragmentToProsemirrorJSON(
        doc.getXmlFragment(blockFragmentName(node.id))
      )
      if (node.kind !== 'code') {
        return [node.id, extractPreviewLines(document)] as const
      }

      try {
        const result = await tokenizeCodeInWorker(
          plainTextFromDocument(document),
          node.language ?? 'plaintext',
          resolveThemeArg(node.theme),
          { priority: 'background' }
        )
        return [node.id, syntaxRangesToPreview(plainTextFromDocument(document), result.ranges)] as const
      } catch {
        return [node.id, extractPreviewLines(document)] as const
      }
    })
  )
  return Object.fromEntries(entries)
}

function collectImageSources(node: LayoutNode, result = new Set<string>()): Set<string> {
  if (node.kind === 'image' && node.src) result.add(node.src)
  node.children?.forEach((child) => collectImageSources(child, result))
  return result
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  try {
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Image preview timed out')), 1500)),
    ])
    return image
  } catch {
    return null
  }
}

async function loadPreviewImages(tree: LayoutNode): Promise<Map<string, HTMLImageElement>> {
  const entries = await Promise.all(
    [...collectImageSources(tree)].map(async (src) => [src, await loadImage(src)] as const)
  )
  return new Map(entries.filter((entry): entry is readonly [string, HTMLImageElement] => entry[1] !== null))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lineTextLength(lines: PreviewLines): number {
  return Math.max(0, ...lines.map((line) => line.reduce((total, run) => total + run.text.length, 0)))
}

function measureNode(node: LayoutNode, content: PreviewContent): { width: number; height: number } {
  if (node.kind === 'code') {
    const lines = content[node.id] ?? [[]]
    const chromeHeight = node.chromeStyle && node.chromeStyle !== 'none' ? 30 : 0
    return {
      width: node.width ?? clamp(lineTextLength(lines) * 7.2 + 40, 180, 520),
      height: node.height ?? clamp(Math.max(lines.length, 1) * 22 + 32 + chromeHeight, 64, 320),
    }
  }
  if (node.kind === 'text') {
    const lines = content[node.id] ?? [[]]
    return {
      width: node.width ?? clamp(lineTextLength(lines) * 7.8 + 20, 160, 420),
      height: node.height ?? clamp(Math.max(lines.length, 1) * 24 + 12, 40, 260),
    }
  }
  if (node.kind === 'image') {
    return { width: node.width ?? 220, height: node.height ?? 140 }
  }
  return { width: node.width ?? 280, height: node.height ?? 180 }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  box: Box,
  radius: number
) {
  const safeRadius = clamp(radius, 0, Math.min(box.width, box.height) / 2)
  context.beginPath()
  context.roundRect(box.x, box.y, box.width, box.height, safeRadius)
}

function isLightColor(color: string): boolean {
  const match = color.match(/^#([0-9a-f]{6})$/i)
  if (!match) return false
  const value = Number.parseInt(match[1], 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return red * 0.299 + green * 0.587 + blue * 0.114 > 170
}

function drawCodeText(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  box: Box,
  content: PreviewContent,
  bodyTop: number,
  fallbackColor: string
) {
  const lines = content[node.id] ?? [[]]
  const lineHeight = 18
  const startX = box.x + 20 + (node.showLineNumbers ? 28 : 0)
  const maxX = box.x + box.width - 16
  const maxY = box.y + box.height - 12

  context.save()
  roundedRect(context, box, 4)
  context.clip()

  lines.forEach((line, lineIndex) => {
    const y = bodyTop + 20 + lineIndex * lineHeight
    if (y > maxY) return

    if (node.showLineNumbers) {
      context.font = '10px ui-monospace, monospace'
      context.fillStyle = fallbackColor
      context.globalAlpha = 0.38
      context.textAlign = 'right'
      context.fillText(String((node.startLineNumber ?? 1) + lineIndex), box.x + 34, y)
      context.textAlign = 'left'
      context.globalAlpha = 1
    }

    let x = startX
    if (line.length === 0 && lineIndex === 0) {
      context.font = '12px ui-monospace, monospace'
      context.fillStyle = fallbackColor
      context.globalAlpha = 0.42
      context.fillText('Paste or type code…', x, y)
      context.globalAlpha = 1
      return
    }

    for (const run of line) {
      if (x >= maxX) break
      context.font = `${run.italic ? 'italic ' : ''}${run.bold ? '600 ' : '400 '}12px ui-monospace, monospace`
      context.fillStyle = run.color ?? fallbackColor
      context.globalAlpha = run.color ? 0.96 : 0.82
      const available = maxX - x
      let visible = run.text
      while (visible.length > 0 && context.measureText(visible).width > available) visible = visible.slice(0, -1)
      context.fillText(visible, x, y)
      x += context.measureText(visible).width
    }
    context.globalAlpha = 1
  })
  context.restore()
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, box: Box) {
  const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.save()
  roundedRect(context, box, 4)
  context.clip()
  context.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height)
  context.restore()
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  box: Box,
  content: PreviewContent,
  images: ReadonlyMap<string, HTMLImageElement>,
  isRoot = false
) {
  if (node.kind === 'code') {
    const background = node.themeBackground ?? resolveThemeBackground(node.theme)
    const fallbackColor = isLightColor(background) ? '#171717' : '#f3f4f6'
    context.fillStyle = background
    roundedRect(context, box, 4)
    context.fill()

    let bodyTop = box.y
    if (node.chromeStyle && node.chromeStyle !== 'none') {
      context.fillStyle = fallbackColor
      context.globalAlpha = 0.08
      context.fillRect(box.x, box.y, box.width, 30)
      context.globalAlpha = 1
      bodyTop += 30

      if (node.chromeStyle === 'mac') {
        ;['#ff5f56', '#ffbd2e', '#27c93f'].forEach((color, index) => {
          context.beginPath()
          context.arc(box.x + 16 + index * 14, box.y + 15, 4, 0, Math.PI * 2)
          context.fillStyle = color
          context.fill()
        })
      } else if (node.filename) {
        context.font = '10px system-ui, sans-serif'
        context.fillStyle = fallbackColor
        context.globalAlpha = 0.58
        context.fillText(node.filename, box.x + 14, box.y + 19)
        context.globalAlpha = 1
      }
    }

    drawCodeText(context, node, box, content, bodyTop, fallbackColor)
    return
  }

  if (node.kind === 'text') {
    const lines = content[node.id] ?? [[]]
    context.fillStyle = '#f3f4f6'
    context.font = '15px system-ui, sans-serif'
    lines.slice(0, 8).forEach((line, index) => {
      const text = line.map((run) => run.text).join('')
      context.globalAlpha = text ? 0.9 : 0.42
      context.fillText(text || 'Write something…', box.x, box.y + 18 + index * 22, box.width)
    })
    context.globalAlpha = 1
    return
  }

  if (node.kind === 'image') {
    const image = node.src ? images.get(node.src) : null
    if (image) {
      drawImageCover(context, image, box)
    } else {
      context.fillStyle = '#2a2a2a'
      roundedRect(context, box, 4)
      context.fill()
      context.strokeStyle = '#666'
      context.globalAlpha = 0.6
      context.strokeRect(box.x + box.width * 0.25, box.y + box.height * 0.3, box.width * 0.5, box.height * 0.4)
      context.globalAlpha = 1
    }
    return
  }

  if (node.background || isRoot) {
    context.fillStyle = node.background ?? '#171717'
    roundedRect(context, box, node.radius ?? (isRoot ? 12 : 0))
    context.fill()
  }

  const children = node.children ?? []
  if (children.length === 0) return
  const padding = node.padding ?? 0
  const inner: Box = {
    x: box.x + padding,
    y: box.y + padding,
    width: Math.max(0, box.width - padding * 2),
    height: Math.max(0, box.height - padding * 2),
  }

  if ((node.childLayout ?? 'flex') === 'canvas') {
    children.forEach((child, index) => {
      const size = measureNode(child, content)
      drawNode(
        context,
        child,
        {
          x: inner.x + (child.x ?? 24 + (index % 8) * 16),
          y: inner.y + (child.y ?? 24 + Math.floor(index / 8) * 16),
          width: size.width,
          height: size.height,
        },
        content,
        images
      )
    })
    return
  }

  const direction = node.direction ?? 'column'
  const sizes = children.map((child) => measureNode(child, content))
  const configuredGap = node.gap ?? 0
  const mainAvailable = direction === 'row' ? inner.width : inner.height
  const totalMain =
    sizes.reduce((total, size) => total + (direction === 'row' ? size.width : size.height), 0) +
    configuredGap * Math.max(0, children.length - 1)
  let gap = configuredGap
  let cursor = direction === 'row' ? inner.x : inner.y

  if (node.justify === 'center') cursor += Math.max(0, (mainAvailable - totalMain) / 2)
  if (node.justify === 'flex-end') cursor += Math.max(0, mainAvailable - totalMain)
  if (node.justify === 'space-between' && children.length > 1) {
    const childrenMain = totalMain - configuredGap * (children.length - 1)
    gap = Math.max(configuredGap, (mainAvailable - childrenMain) / (children.length - 1))
  }
  if (node.justify === 'space-around' && children.length > 0) {
    const childrenMain = totalMain - configuredGap * Math.max(0, children.length - 1)
    gap = Math.max(configuredGap, (mainAvailable - childrenMain) / children.length)
    cursor += gap / 2
  }

  children.forEach((child, index) => {
    const size = { ...sizes[index] }
    const crossAvailable = direction === 'row' ? inner.height : inner.width
    const childCross = direction === 'row' ? size.height : size.width
    let cross = direction === 'row' ? inner.y : inner.x
    if (node.align === 'center') cross += Math.max(0, (crossAvailable - childCross) / 2)
    if (node.align === 'flex-end') cross += Math.max(0, crossAvailable - childCross)
    if (node.align === 'stretch') {
      if (direction === 'row') size.height = crossAvailable
      else size.width = crossAvailable
    }

    const childBox =
      direction === 'row'
        ? { x: cursor, y: cross, width: size.width, height: size.height }
        : { x: cross, y: cursor, width: size.width, height: size.height }
    drawNode(context, child, childBox, content, images)
    cursor += (direction === 'row' ? size.width : size.height) + gap
  })
}

async function generateDocumentPreview(meta: DocumentMeta): Promise<string | null> {
  const pageId = meta.pageIds?.[0] ?? meta.id
  const { doc, synced } = getYDoc(pageId)
  await synced
  const tree = toPlainTree(doc)
  if (!tree) return null

  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = PREVIEW_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return null

  const [content, images] = await Promise.all([
    collectPreviewContent(tree, doc),
    loadPreviewImages(tree),
  ])
  const logicalWidth = Math.max(1, tree.width ?? PREVIEW_WIDTH)
  const logicalHeight = Math.max(1, tree.height ?? PREVIEW_HEIGHT)
  const scale = Math.min(PREVIEW_WIDTH / logicalWidth, PREVIEW_HEIGHT / logicalHeight)
  const offsetX = (PREVIEW_WIDTH - logicalWidth * scale) / 2
  const offsetY = (PREVIEW_HEIGHT - logicalHeight * scale) / 2

  context.fillStyle = '#202020'
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  context.save()
  context.translate(offsetX, offsetY)
  context.scale(scale, scale)
  drawNode(
    context,
    tree,
    { x: 0, y: 0, width: logicalWidth, height: logicalHeight },
    content,
    images,
    true
  )
  context.restore()

  try {
    return canvas.toDataURL('image/webp', 0.82)
  } catch {
    // A broken or unexpectedly cross-origin image should not prevent the
    // dashboard from falling back to its lightweight placeholder.
    return null
  }
}

export async function loadDocumentPreview(meta: DocumentMeta): Promise<string | null> {
  const cached = readCachedPreview(meta)
  if (cached) return cached
  try {
    const dataUrl = await generateDocumentPreview(meta)
    if (dataUrl) writeCachedPreview(meta, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

export async function refreshDocumentPreview(docId: string): Promise<string | null> {
  const meta = getDocumentMeta(docId)
  if (!meta) return null
  try {
    const dataUrl = await generateDocumentPreview(meta)
    if (dataUrl) writeCachedPreview(meta, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}
