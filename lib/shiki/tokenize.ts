'use server'

import { getSingletonHighlighter, type BundledLanguage, type BundledTheme } from 'shiki'

export interface PlainToken {
  content: string
  color: string | null
  bold: boolean
  italic: boolean
}

export interface TokenizeResult {
  lines: PlainToken[][]
  themeBg: string
  themeFg: string
}

// Themes render some tokens (e.g. comments) in italic/bold via TextMate fontStyle bits:
// 1 = italic, 2 = bold (see @shikijs/vscode-textmate FontStyle).
function decodeFontStyle(fontStyle: number | undefined) {
  const style = fontStyle ?? 0
  return { bold: (style & 2) !== 0, italic: (style & 1) !== 0 }
}

export async function tokenizeCode(
  code: string,
  lang: string,
  theme: string
): Promise<TokenizeResult> {
  // Cached across calls in this server process -- only loads a lang/theme's
  // grammar/wasm once, and never ships to the client bundle since this file
  // is server-only ('use server').
  const highlighter = await getSingletonHighlighter({
    langs: [lang as BundledLanguage],
    themes: [theme as BundledTheme],
  })

  const tokenLines = highlighter.codeToTokensBase(code, {
    lang: lang as BundledLanguage,
    theme: theme as BundledTheme,
  })
  const resolvedTheme = highlighter.getTheme(theme as BundledTheme)

  const lines = tokenLines.map((line) =>
    line.map((token) => {
      const { bold, italic } = decodeFontStyle(token.fontStyle)
      return {
        content: token.content,
        color: token.color ?? null,
        bold,
        italic,
      }
    })
  )

  return { lines, themeBg: resolvedTheme.bg, themeFg: resolvedTheme.fg }
}
