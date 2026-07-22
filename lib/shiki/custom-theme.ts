import type { ThemeRegistrationRaw } from 'shiki'

export type SyntaxCategory =
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'constant'
  | 'function'
  | 'variable'
  | 'type'
  | 'tag'
  | 'attribute'
  | 'property'
  | 'operator'
  | 'punctuation'
  | 'regexp'

export interface CustomSyntaxTheme {
  id: string
  name: string
  background: string
  foreground: string
  colors: Record<SyntaxCategory, string>
}

export const SYNTAX_CATEGORIES: Array<{ key: SyntaxCategory; label: string }> = [
  { key: 'comment', label: 'Comment' },
  { key: 'keyword', label: 'Keyword' },
  { key: 'string', label: 'String' },
  { key: 'number', label: 'Number' },
  { key: 'constant', label: 'Constant' },
  { key: 'function', label: 'Function' },
  { key: 'variable', label: 'Variable' },
  { key: 'type', label: 'Type' },
  { key: 'tag', label: 'Tag' },
  { key: 'attribute', label: 'Attribute' },
  { key: 'property', label: 'Property' },
  { key: 'operator', label: 'Operator' },
  { key: 'punctuation', label: 'Punctuation' },
  { key: 'regexp', label: 'Regexp' },
]

// Real TextMate scopes each friendly category maps to -- hand-verified
// against the bundled Dracula theme's actual tokenColors during research.
// Broad enough to light up the common grammars (JS/TS/Python/Rust/Go/etc),
// not an exhaustive scope list.
const CATEGORY_SCOPES: Record<SyntaxCategory, string[]> = {
  comment: ['comment', 'punctuation.definition.comment'],
  keyword: ['keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier'],
  string: ['string', 'string.quoted', 'punctuation.definition.string'],
  number: ['constant.numeric'],
  constant: ['constant', 'constant.language', 'constant.character', 'variable.other.constant'],
  function: ['entity.name.function', 'support.function', 'meta.function-call'],
  variable: ['variable', 'variable.other', 'variable.parameter'],
  type: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  tag: ['entity.name.tag', 'meta.tag'],
  attribute: ['entity.other.attribute-name'],
  property: ['variable.other.property', 'meta.object-literal.key', 'support.type.property-name'],
  operator: ['keyword.operator'],
  punctuation: ['punctuation', 'punctuation.separator', 'punctuation.terminator'],
  regexp: ['string.regexp'],
}

// A Dracula-inspired starting point -- new custom themes begin from
// something already reasonable rather than a flat, undifferentiated color.
export const DEFAULT_CUSTOM_THEME_COLORS: Record<SyntaxCategory, string> = {
  comment: '#6272a4',
  keyword: '#ff79c6',
  string: '#f1fa8c',
  number: '#bd93f9',
  constant: '#bd93f9',
  function: '#50fa7b',
  variable: '#f8f8f2',
  type: '#8be9fd',
  tag: '#ff79c6',
  attribute: '#50fa7b',
  property: '#66d9ef',
  operator: '#ff79c6',
  punctuation: '#f8f8f2',
  regexp: '#f1fa8c',
}

export function createBlankCustomTheme(name = 'Untitled theme'): CustomSyntaxTheme {
  return {
    id: crypto.randomUUID(),
    name,
    background: '#282a36',
    foreground: '#f8f8f2',
    colors: { ...DEFAULT_CUSTOM_THEME_COLORS },
  }
}

// Not for security -- just enough to make two different theme contents map
// to (almost certainly) different strings, for the cache-busting name below.
function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

function isDarkHexColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return true
  const [r, g, b] = match.slice(1).map((h) => parseInt(h, 16))
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}

/** Expands a ~14-category custom theme into a full, standalone Shiki/
 * TextMate theme object -- a complete replacement theme (not an overlay on
 * top of a bundled one), built from real scopes so it lights up the same
 * grammar tokens a bundled theme would. Confirmed valid: Shiki's
 * getSingletonHighlighter accepts full hand-authored theme objects in its
 * `themes` array, not just bundled name strings. */
export function buildShikiTheme(custom: CustomSyntaxTheme): ThemeRegistrationRaw {
  // IMPORTANT: the name can't be a pure function of custom.id.
  // getSingletonHighlighter (lib/shiki/tokenize.ts) caches a registered
  // theme by its `name` across calls within the same server process -- if
  // the name stayed constant while a theme's colors changed (e.g. the
  // customize dialog's live preview re-tokenizing after every edit, or
  // simply re-selecting a theme after editing it later), Shiki would
  // silently keep serving whatever colors were registered under that name
  // FIRST, ignoring every subsequent edit. Folding a content hash in forces
  // Shiki to treat an edited theme as a distinct registration. Confirmed via
  // direct testing against the installed shiki package.
  const contentHash = simpleHash(JSON.stringify(custom))
  return {
    name: `custom-${custom.id}-${contentHash}`,
    type: isDarkHexColor(custom.background) ? 'dark' : 'light',
    bg: custom.background,
    fg: custom.foreground,
    colors: {
      'editor.background': custom.background,
      'editor.foreground': custom.foreground,
    },
    tokenColors: (Object.keys(custom.colors) as SyntaxCategory[]).map((category) => ({
      scope: CATEGORY_SCOPES[category],
      settings: { foreground: custom.colors[category] },
    })),
    // IMPORTANT: do NOT add a `settings` key here, even an empty array.
    // ThemeRegistrationRaw's type claims it's required (inherited from the
    // raw vscode-textmate RawTheme interface), but empirically, Shiki only
    // falls back to reading `tokenColors` (above) when `settings` is
    // entirely ABSENT -- if the key exists at all, Shiki uses it as-is and
    // every tokenColors rule is silently ignored, leaving all tokens
    // uncolored. Confirmed by direct testing against the installed shiki
    // package. The `as ThemeRegistrationRaw` cast below is what lets this
    // object omit that (falsely-required) field.
  } as unknown as ThemeRegistrationRaw
}
