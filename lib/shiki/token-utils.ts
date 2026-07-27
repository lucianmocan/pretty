import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
  ThemeRegistrationRaw,
} from 'shiki'
import type { TokenizeLinesResult } from './token-types'

function decodeFontStyle(fontStyle: number | undefined) {
  const style = fontStyle ?? 0
  return { bold: (style & 2) !== 0, italic: (style & 1) !== 0 }
}

export function tokensFromHighlighter(
  highlighter: Highlighter,
  code: string,
  language: string,
  theme: string | ThemeRegistrationRaw
): TokenizeLinesResult {
  const themeName = typeof theme === 'string' ? theme : (theme.name as string)
  const tokenLines = highlighter.codeToTokensBase(code, {
    lang: language as BundledLanguage,
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
