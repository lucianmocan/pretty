import type { CSSProperties } from 'react'
import { textFontFamilyCss } from '@/lib/google-fonts'
import { DEFAULT_TEXT_BLOCK_PROPS, type TextBlockProps } from './types'

export function textBlockStyle(props: Partial<TextBlockProps>): CSSProperties {
  const family = props.textFontFamily ?? DEFAULT_TEXT_BLOCK_PROPS.textFontFamily
  const source = props.textFontSource ?? DEFAULT_TEXT_BLOCK_PROPS.textFontSource
  const textColor = props.textColor ?? DEFAULT_TEXT_BLOCK_PROPS.textColor
  return {
    '--scripture-text-font': textFontFamilyCss(family, source),
    '--scripture-text-font-size': `${props.textFontSize ?? DEFAULT_TEXT_BLOCK_PROPS.textFontSize}px`,
    '--scripture-text-font-weight': props.textFontWeight ?? DEFAULT_TEXT_BLOCK_PROPS.textFontWeight,
    '--scripture-text-font-style': props.textFontStyle ?? DEFAULT_TEXT_BLOCK_PROPS.textFontStyle,
    '--scripture-text-line-height': String(props.textLineHeight ?? DEFAULT_TEXT_BLOCK_PROPS.textLineHeight),
    '--scripture-text-letter-spacing': `${props.textLetterSpacing ?? DEFAULT_TEXT_BLOCK_PROPS.textLetterSpacing}px`,
    '--scripture-text-color': textColor,
    // The wrapper owns empty-state text while the child editor owns authored
    // text. Giving both the same resolved foreground keeps placeholders
    // correct for app-theme defaults and explicit authored colors alike.
    color: textColor,
  } as CSSProperties
}
