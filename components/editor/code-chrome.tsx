'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { FileCode, Terminal, Folder, Code, Braces, type LucideIcon } from 'lucide-react'
import { fontCssVar } from '@/lib/presets'
import { rangesToSet } from '@/lib/layout/line-ranges'
import { cn } from '@/lib/utils'
import type { ChromeStyle, ChromeIconKey, CustomChromeStyle } from '@/lib/layout/types'
import { DEFAULT_CODE_FONT_SIZE } from '@/lib/tiptap/line-font-sizes'

// Exported for components/ui/chrome-style-picker.tsx's own mini swatch
// previews of saved custom chrome styles -- same icon set, no reason to
// duplicate the mapping.
export const CUSTOM_CHROME_ICONS: Record<ChromeIconKey, LucideIcon | null> = {
  none: null,
  'file-code': FileCode,
  terminal: Terminal,
  folder: Folder,
  code: Code,
  braces: Braces,
}

interface CodeChromeProps {
  fontFamily: string
  filename: string
  chromeStyle: ChromeStyle
  showLineNumbers: boolean
  lineNumberColor?: string
  foregroundColor?: string
  lineCount: number
  lineFontSizes?: number[]
  startLineNumber: number
  ligatures: boolean
  lineHeight: number
  letterSpacing: number
  highlightLines: Array<[number, number]>
  trimRanges: Array<[number, number]>
  diffLines: Record<number, 'add' | 'remove'>
  // Only meaningful when chromeStyle === 'custom' -- the block's own copy of
  // a saved custom chrome (see lib/layout/types.ts's comment on
  // CustomChromeStyle for why it's a full copy, not just an id reference).
  customChrome?: CustomChromeStyle
  // Only provided by the live editor -- the print route has no interaction,
  // so gutter numbers there just aren't clickable.
  onLineClick?: (lineNumber: number) => void
  children: ReactNode
}

function ChromeBar({
  chromeStyle,
  filename,
  customChrome,
}: {
  chromeStyle: ChromeStyle
  filename: string
  customChrome?: CustomChromeStyle
}) {
  if (chromeStyle === 'custom' && customChrome) {
    const Icon = CUSTOM_CHROME_ICONS[customChrome.icon]
    return (
      <div
        className="scripture-chrome-bar"
        style={{
          background: customChrome.barBackground,
          borderBottomColor: customChrome.barBorderColor,
          color: customChrome.textColor,
          borderRadius: customChrome.radius,
        }}
      >
        {customChrome.dotColors && (
          <>
            <span className="scripture-dot" style={{ background: customChrome.dotColors[0] }} />
            <span className="scripture-dot" style={{ background: customChrome.dotColors[1] }} />
            <span className="scripture-dot" style={{ background: customChrome.dotColors[2] }} />
          </>
        )}
        {Icon && <Icon size={13} />}
        {filename &&
          (customChrome.filenamePosition === 'tab' ? (
            <span className="scripture-chrome-tab" style={{ borderBottomColor: customChrome.textColor }}>
              {filename}
            </span>
          ) : (
            <span className="scripture-filename" style={{ color: customChrome.textColor }}>
              {filename}
            </span>
          ))}
      </div>
    )
  }
  if (chromeStyle === 'mac') {
    return (
      <div className="scripture-chrome-bar scripture-chrome-mac">
        <span className="scripture-dot scripture-dot-red" />
        <span className="scripture-dot scripture-dot-yellow" />
        <span className="scripture-dot scripture-dot-green" />
        {filename && <span className="scripture-filename">{filename}</span>}
      </div>
    )
  }
  if (chromeStyle === 'vscode-tab') {
    return (
      <div className="scripture-chrome-bar scripture-chrome-vscode">
        <span className="scripture-chrome-tab">
          <FileCode size={13} />
          <span className="scripture-filename">{filename || 'untitled'}</span>
        </span>
      </div>
    )
  }
  if (chromeStyle === 'terminal') {
    return (
      <div className="scripture-chrome-bar scripture-chrome-terminal">
        <Terminal size={13} />
        {filename && <span className="scripture-filename">{filename}</span>}
      </div>
    )
  }
  return null
}

/**
 * Window chrome (an optional bar above the code, in one of a few styles), a
 * line-number gutter, and per-line highlight/diff/trim overlays wrapping a
 * code block's content. Purely presentational -- used identically by the
 * live BlockEditor and the print route, so neither can diverge. Line numbers
 * work because the code content always renders with `white-space: pre` (see
 * AnnotatedCodeBlock), so one literal '\n' is always exactly one visual
 * line -- no reflow-based line counting needed.
 */
export function CodeChrome({
  fontFamily,
  filename,
  chromeStyle,
  customChrome,
  showLineNumbers,
  lineNumberColor = '#8b949e',
  foregroundColor = 'currentColor',
  lineCount,
  lineFontSizes = [],
  startLineNumber,
  ligatures,
  lineHeight,
  letterSpacing,
  highlightLines,
  trimRanges,
  diffLines,
  onLineClick,
  children,
}: CodeChromeProps) {
  const [revealed, setRevealed] = useState(false)

  const style = {
    '--scripture-code-font': `var(${fontCssVar(fontFamily)})`,
    // font-variant-ligatures, not font-feature-settings: ProseMirror's own
    // base stylesheet sets font-feature-settings: "liga" 0 directly on
    // .ProseMirror (deliberately, so ligatures never make cursor placement
    // ambiguous) -- font-variant-ligatures is the property browsers give
    // priority to when the two conflict, so it's the one that actually wins.
    '--scripture-code-ligature-variant': ligatures ? 'normal' : 'none',
    '--scripture-code-line-height': lineHeight,
    '--scripture-code-letter-spacing': `${letterSpacing}px`,
    '--scripture-line-number-color': lineNumberColor,
    '--scripture-code-foreground': foregroundColor,
    color: foregroundColor,
  } as CSSProperties

  const highlightSet = rangesToSet(highlightLines)
  const trimmedSet = rangesToSet(trimRanges)
  const showTrimCovers = trimRanges.length > 0 && !revealed
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1)
  let nextLineTop = 0
  const lineMetrics = lineNumbers.map((_, index) => {
    const fontSize = lineFontSizes[index] ?? DEFAULT_CODE_FONT_SIZE
    // ProseMirror's 14px block strut remains the minimum line-box height
    // even when every glyph on a line is formatted smaller.
    const height = lineHeight * Math.max(fontSize, DEFAULT_CODE_FONT_SIZE)
    const metric = { fontSize, height, top: nextLineTop }
    nextLineTop += height
    return metric
  })

  return (
    <div className="scripture-code-chrome" style={style}>
      <ChromeBar chromeStyle={chromeStyle} filename={filename} customChrome={customChrome} />
      <div className="scripture-code-body">
        {showLineNumbers && (
          <div
            className="scripture-line-numbers"
            aria-hidden={onLineClick ? undefined : 'true'}
            data-node-drag-ignore={onLineClick ? 'true' : undefined}
            style={{
              // Keep the critical contrast values inline. Besides making the
              // theme ownership explicit, this prevents a generic app-theme
              // gutter rule from winning over a light syntax theme.
              color: lineNumberColor,
              borderRightColor: `color-mix(in srgb, ${lineNumberColor} 36%, transparent)`,
            }}
          >
            {lineNumbers.map((lineNumber) => {
              const metric = lineMetrics[lineNumber - 1]
              const displayNumber = lineNumber - 1 + startLineNumber
              const diff = diffLines[lineNumber]
              const highlighted = highlightSet.has(lineNumber)
              const trimmed = trimmedSet.has(lineNumber)
              const state = [
                highlighted && 'highlighted',
                diff === 'add' && 'added',
                diff === 'remove' && 'removed',
                trimmed && 'trimmed',
              ].filter(Boolean)
              return onLineClick ? (
                <button
                  key={lineNumber}
                  type="button"
                  className="scripture-line-number-clickable"
                  onClick={() => onLineClick(lineNumber)}
                  aria-pressed={state.length > 0}
                  aria-label={`Line ${displayNumber}${state.length > 0 ? `, ${state.join(', ')}` : ''}`}
                  data-highlighted={highlighted || undefined}
                  data-diff={diff}
                  data-trimmed={trimmed || undefined}
                  style={{ fontSize: metric.fontSize, lineHeight: `${metric.height}px` }}
                >
                  {displayNumber}
                </button>
              ) : (
                <div
                  key={lineNumber}
                  style={{ fontSize: metric.fontSize, lineHeight: `${metric.height}px` }}
                >
                  {displayNumber}
                </div>
              )
            })}
          </div>
        )}
        <div className="scripture-code-content">
          <div className="scripture-code-overlay" aria-hidden="true">
            {lineNumbers.map((lineNumber) => {
              const diff = diffLines[lineNumber]
              const isHighlighted = highlightSet.has(lineNumber)
              const metric = lineMetrics[lineNumber - 1]
              if (!diff && !isHighlighted) return null
              return (
                <div
                  key={lineNumber}
                  className={cn(
                    'scripture-code-row',
                    isHighlighted && 'scripture-code-row-highlight',
                    diff === 'add' && 'scripture-code-row-add',
                    diff === 'remove' && 'scripture-code-row-remove'
                  )}
                  style={{ top: metric.top, height: metric.height }}
                />
              )
            })}
          </div>
          {showTrimCovers &&
            trimRanges.map(([start, end]) => (
              <button
                key={`${start}-${end}`}
                type="button"
                className="scripture-code-trim"
                style={{
                  top: lineMetrics[start - 1]?.top ?? 0,
                  height: lineMetrics
                    .slice(start - 1, end)
                    .reduce((height, metric) => height + metric.height, 0),
                }}
                onClick={() => setRevealed(true)}
              >
                ⋯ {end - start + 1} line{end - start + 1 === 1 ? '' : 's'} hidden
              </button>
            ))}
          {children}
        </div>
      </div>
    </div>
  )
}
