import { Mark, mergeAttributes } from '@tiptap/core'
import type { TextFontSource } from '@/lib/layout/types'
import { textFontFamilyCss } from '@/lib/google-fonts'

export interface FormatOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    format: {
      setHighlight: (color: string) => ReturnType
      unsetHighlight: () => ReturnType
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
      setFontWeight: (weight: number) => ReturnType
      unsetFontWeight: () => ReturnType
      setFontFamily: (family: string, source: TextFontSource) => ReturnType
      unsetFontFamily: () => ReturnType
      setLineHeight: (height: string) => ReturnType
      unsetLineHeight: () => ReturnType
      setLetterSpacing: (spacing: string) => ReturnType
      unsetLetterSpacing: () => ReturnType
      setTextColor: (color: string) => ReturnType
      unsetTextColor: () => ReturnType
    }
  }
}

/**
 * User-applied highlight color + font size, consolidated into one mark (not
 * two) so future retokenize/diff logic only has one mark type to reconcile.
 */
export const FormatMark = Mark.create<FormatOptions>({
  name: 'format',

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      highlight: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || null,
        renderHTML: () => ({}),
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: () => ({}),
      },
      fontWeight: {
        default: null,
        parseHTML: (element) => element.style.fontWeight || null,
        renderHTML: () => ({}),
      },
      fontFamily: {
        default: null,
        parseHTML: (element) => element.style.fontFamily || null,
        renderHTML: () => ({}),
      },
      fontSource: {
        default: null,
        parseHTML: (element) => element.dataset.fontSource || null,
        renderHTML: () => ({}),
      },
      lineHeight: {
        default: null,
        parseHTML: (element) => element.style.lineHeight || null,
        renderHTML: () => ({}),
      },
      letterSpacing: {
        default: null,
        parseHTML: (element) => element.style.letterSpacing || null,
        renderHTML: () => ({}),
      },
      textColor: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-format]' }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    const attrs = mark.attrs as Record<string, unknown>
    const styles = [
      typeof attrs.highlight === 'string'
        ? `background-color: ${attrs.highlight}; box-shadow: 0 0 0 0.06em ${attrs.highlight}`
        : null,
      typeof attrs.fontSize === 'string' ? `font-size: ${attrs.fontSize}` : null,
      typeof attrs.fontWeight === 'number' || typeof attrs.fontWeight === 'string'
        ? `font-weight: ${attrs.fontWeight}`
        : null,
      typeof attrs.fontFamily === 'string'
        ? `font-family: ${textFontFamilyCss(attrs.fontFamily, attrs.fontSource as TextFontSource)}`
        : null,
      typeof attrs.lineHeight === 'string' ? `line-height: ${attrs.lineHeight}` : null,
      typeof attrs.letterSpacing === 'string' ? `letter-spacing: ${attrs.letterSpacing}` : null,
      typeof attrs.textColor === 'string' ? `color: ${attrs.textColor}` : null,
    ].filter((style): style is string => Boolean(style))
    const nextAttributes = {
      ...HTMLAttributes,
      ...(styles.length > 0 ? { style: styles.join('; ') } : {}),
      ...(typeof attrs.fontSource === 'string' ? { 'data-font-source': attrs.fontSource } : {}),
    }
    return ['span', mergeAttributes(this.options.HTMLAttributes, nextAttributes, { 'data-format': '' }), 0]
  },

  addCommands() {
    // format has two independent attrs on one mark, so every command merges
    // with whatever the selection already has instead of clobbering the other.
    return {
      setHighlight:
        (color: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), highlight: color }),
      unsetHighlight:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), highlight: null }),
      setFontSize:
        (size: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontSize: size }),
      unsetFontSize:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontSize: null }),
      setFontWeight:
        (weight: number) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontWeight: weight }),
      unsetFontWeight:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontWeight: null }),
      setFontFamily:
        (family: string, source: TextFontSource) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontFamily: family, fontSource: source }),
      unsetFontFamily:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), fontFamily: null, fontSource: null }),
      setLineHeight:
        (height: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), lineHeight: height }),
      unsetLineHeight:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), lineHeight: null }),
      setLetterSpacing:
        (spacing: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), letterSpacing: spacing }),
      unsetLetterSpacing:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), letterSpacing: null }),
      setTextColor:
        (color: string) =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), textColor: color }),
      unsetTextColor:
        () =>
        ({ editor, commands }) =>
          commands.setMark(this.name, { ...editor.getAttributes(this.name), textColor: null }),
    }
  },
})
