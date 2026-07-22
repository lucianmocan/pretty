'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { FileCode, Terminal } from 'lucide-react'
import { fontCssVar } from '@/lib/presets'
import { rangesToSet } from '@/lib/layout/line-ranges'
import { cn } from '@/lib/utils'
import type { ChromeStyle } from '@/lib/layout/types'

// Matches .scripture-code-editor's fixed font-size in app/globals.css --
// with an explicit numeric line-height, row height in px is deterministic
// (unitless line-height is always "this number times font-size", not an
// approximation), so highlight/diff/trim overlays can be positioned by
// arithmetic instead of measuring rendered DOM rects.
const CODE_FONT_SIZE_PX = 14

interface CodeChromeProps {
  fontFamily: string
  filename: string
  chromeStyle: ChromeStyle
  showLineNumbers: boolean
  lineCount: number
  startLineNumber: number
  ligatures: boolean
  lineHeight: number
  letterSpacing: number
  highlightLines: Array<[number, number]>
  trimRanges: Array<[number, number]>
  diffLines: Record<number, 'add' | 'remove'>
  // Only provided by the live editor -- the print route has no interaction,
  // so gutter numbers there just aren't clickable.
  onLineClick?: (lineNumber: number) => void
  children: ReactNode
}

function ChromeBar({ chromeStyle, filename }: { chromeStyle: ChromeStyle; filename: string }) {
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
  showLineNumbers,
  lineCount,
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
  } as CSSProperties

  const rowHeight = lineHeight * CODE_FONT_SIZE_PX
  const highlightSet = rangesToSet(highlightLines)
  const showTrimCovers = trimRanges.length > 0 && !revealed
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1)

  return (
    <div className="scripture-code-chrome" style={style}>
      <ChromeBar chromeStyle={chromeStyle} filename={filename} />
      <div className="scripture-code-body">
        {showLineNumbers && (
          <div className="scripture-line-numbers" aria-hidden="true">
            {lineNumbers.map((lineNumber) => (
              <div
                key={lineNumber}
                className={onLineClick ? 'scripture-line-number-clickable' : undefined}
                onClick={onLineClick ? () => onLineClick(lineNumber) : undefined}
              >
                {lineNumber - 1 + startLineNumber}
              </div>
            ))}
          </div>
        )}
        <div className="scripture-code-content">
          <div className="scripture-code-overlay" aria-hidden="true">
            {lineNumbers.map((lineNumber) => {
              const diff = diffLines[lineNumber]
              const isHighlighted = highlightSet.has(lineNumber)
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
                  style={{ top: (lineNumber - 1) * rowHeight, height: rowHeight }}
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
                style={{ top: (start - 1) * rowHeight, height: (end - start + 1) * rowHeight }}
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
