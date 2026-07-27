import type { ThemeRegistrationRaw } from 'shiki'

export interface PlainToken {
  content: string
  color: string | null
  bold: boolean
  italic: boolean
}

export interface SyntaxStyleRange {
  from: number
  to: number
  color: string | null
  bold: boolean
  italic: boolean
}

export interface TokenizeLinesResult {
  lines: PlainToken[][]
  themeBg: string
  themeFg: string
}

export interface TokenizeResult {
  ranges: SyntaxStyleRange[]
  themeBg: string
  themeFg: string
}

export type TokenizeTheme = string | ThemeRegistrationRaw
export type SyntaxPriority = 'focused' | 'visible' | 'background'

export interface TokenizeWorkerRequest {
  type: 'tokenize'
  id: number
  code: string
  language: string
  theme: TokenizeTheme
}

export interface CancelTokenizeWorkerRequest {
  type: 'cancel'
  id: number
}

export type TokenizeWorkerMessage = TokenizeWorkerRequest | CancelTokenizeWorkerRequest

export type TokenizeWorkerResponse =
  | { id: number; result: TokenizeResult }
  | { id: number; error: string }
