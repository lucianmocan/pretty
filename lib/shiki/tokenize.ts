'use server'

import {
  getSingletonHighlighter,
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
  type ThemeRegistrationRaw,
} from 'shiki'

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

function tokensFromHighlighter(highlighter: Highlighter, code: string, lang: string, themeName: string): TokenizeResult {
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

  return tokensFromHighlighter(highlighter, code, lang, themeName)
}

/**
 * Same as tokenizeCode, but for the customize dialog's live preview
 * specifically: a dedicated, disposable highlighter instead of the shared
 * singleton above. buildShikiTheme() deliberately gives every edited draft a
 * unique, content-hashed theme name (so getSingletonHighlighter's own name-
 * based cache doesn't keep serving stale colors after an edit) -- but the
 * live preview calls this on every debounced color tweak, so reusing the
 * SAME singleton here would register a new, never-evicted theme into that
 * process-wide cache on every keystroke, growing unboundedly for the life of
 * the server process. Creating + disposing a one-off instance per call
 * avoids that leak entirely, at the cost of reloading the lang/theme grammar
 * each time -- a fine trade-off for a human-paced, debounced preview call
 * (not the hot path every other tokenizeCode call site is on).
 */
export async function tokenizePreviewCode(
  code: string,
  lang: string,
  theme: string | ThemeRegistrationRaw
): Promise<TokenizeResult> {
  const themeName = typeof theme === 'string' ? theme : (theme.name as string)
  const highlighter = await createHighlighter({
    langs: [lang as BundledLanguage],
    themes: [typeof theme === 'string' ? (theme as BundledTheme) : theme],
  })
  try {
    return tokensFromHighlighter(highlighter, code, lang, themeName)
  } finally {
    highlighter.dispose()
  }
}
