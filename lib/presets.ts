export const LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'lean4',
  'haskell',
  'ocaml',
  'sql',
  'bash',
  'json',
  'html',
  'css',
] as const

export const THEMES = [
  'dracula',
  'nord',
  'one-dark-pro',
  'github-dark',
  'github-light',
  'monokai',
  'catppuccin-mocha',
  'vitesse-dark',
  'vitesse-light',
  'material-theme-ocean',
] as const

export const DEFAULT_LANGUAGE: (typeof LANGUAGES)[number] = 'python'
export const DEFAULT_THEME: (typeof THEMES)[number] = 'dracula'

// Static preview colors for the Inspector's theme swatch picker -- bg/fg
// match each theme's actual resolved editor.background/foreground (checked
// against the bundled @shikijs/themes source); the two accent dots are
// representative, not exact token colors, purely for a recognizable preview.
export const THEME_PREVIEWS: Record<(typeof THEMES)[number], { bg: string; accents: [string, string] }> = {
  dracula: { bg: '#282a36', accents: ['#ff79c6', '#50fa7b'] },
  nord: { bg: '#2e3440', accents: ['#88c0d0', '#a3be8c'] },
  'one-dark-pro': { bg: '#282c34', accents: ['#e06c75', '#61afef'] },
  'github-dark': { bg: '#24292e', accents: ['#79c0ff', '#ffa657'] },
  'github-light': { bg: '#ffffff', accents: ['#0550ae', '#8250df'] },
  monokai: { bg: '#272822', accents: ['#f92672', '#a6e22e'] },
  'catppuccin-mocha': { bg: '#1e1e2e', accents: ['#cba6f7', '#a6e3a1'] },
  'vitesse-dark': { bg: '#121212', accents: ['#e6cc77', '#4d9375'] },
  'vitesse-light': { bg: '#ffffff', accents: ['#b07d48', '#388a34'] },
  'material-theme-ocean': { bg: '#0f111a', accents: ['#89ddff', '#f78c6c'] },
}

export const FONT_OPTIONS = [
  { key: 'geist-mono', label: 'Geist Mono', cssVar: '--font-geist-mono' },
  { key: 'jetbrains-mono', label: 'JetBrains Mono', cssVar: '--font-jetbrains-mono' },
  { key: 'fira-code', label: 'Fira Code', cssVar: '--font-fira-code' },
  { key: 'ibm-plex-mono', label: 'IBM Plex Mono', cssVar: '--font-ibm-plex-mono' },
] as const

export const DEFAULT_FONT_KEY: (typeof FONT_OPTIONS)[number]['key'] = 'geist-mono'

export function fontCssVar(key: string | undefined): string {
  return FONT_OPTIONS.find((f) => f.key === key)?.cssVar ?? FONT_OPTIONS[0].cssVar
}
