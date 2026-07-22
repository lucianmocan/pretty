'use server'

import { getSingletonHighlighter, type BundledLanguage, type BundledTheme, type ThemeRegistrationRaw } from 'shiki'

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
  // Either a bundled theme name, or (for user-defined custom themes, which
  // live in this browser's localStorage that a server action can't reach) a
  // full theme object built client-side by lib/shiki/custom-theme.ts's
  // buildShikiTheme() and passed in whole -- getSingletonHighlighter accepts
  // both in the same `themes` array.
  theme: string | ThemeRegistrationRaw
): Promise<TokenizeResult> {
  const themeName = typeof theme === 'string' ? theme : (theme.name as string)

  // Cached across calls in this server process -- only loads a lang/theme's
  // grammar/wasm once, and never ships to the client bundle since this file
  // is server-only ('use server').
  const highlighter = await getSingletonHighlighter({
    langs: [lang as BundledLanguage],
    themes: [typeof theme === 'string' ? (theme as BundledTheme) : theme],
  })

  const tokenLines = highlighter.codeToTokensBase(code, {
    lang: lang as BundledLanguage,
    theme: themeName as BundledTheme,
  })
  const resolvedTheme = highlighter.getTheme(themeName as BundledTheme)

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
