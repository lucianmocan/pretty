'use server'

import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type ThemeRegistrationRaw,
} from 'shiki'
import { tokensFromHighlighter } from './token-utils'
import type { TokenizeLinesResult } from './token-types'

export type { PlainToken, TokenizeLinesResult } from './token-types'

/**
 * The customize dialog previews a new, content-hashed theme on every edit.
 * A disposable highlighter keeps those unsaved drafts out of the long-lived
 * browser worker cache used by document editors.
 */
export async function tokenizePreviewCode(
  code: string,
  lang: string,
  theme: string | ThemeRegistrationRaw
): Promise<TokenizeLinesResult> {
  const highlighter = await createHighlighter({
    langs: [lang as BundledLanguage],
    themes: [typeof theme === 'string' ? (theme as BundledTheme) : theme],
  })
  try {
    return tokensFromHighlighter(highlighter, code, lang, theme)
  } finally {
    highlighter.dispose()
  }
}
