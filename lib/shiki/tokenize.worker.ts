import {
  getSingletonHighlighter,
  type BundledLanguage,
  type BundledTheme,
} from 'shiki'
import type {
  TokenizeWorkerMessage,
  TokenizeWorkerRequest,
  TokenizeWorkerResponse,
} from './token-types'
import { tokensFromHighlighter } from './token-utils'
import { syntaxStyleRanges } from './token-ranges'

async function tokenize(request: TokenizeWorkerRequest): Promise<TokenizeWorkerResponse> {
  try {
    const highlighter = await getSingletonHighlighter({
      langs: [request.language as BundledLanguage],
      themes: [
        typeof request.theme === 'string'
          ? (request.theme as BundledTheme)
          : request.theme,
      ],
    })

    const tokenized = tokensFromHighlighter(
      highlighter,
      request.code,
      request.language,
      request.theme
    )
    return {
      id: request.id,
      result: {
        ranges: syntaxStyleRanges(request.code, tokenized.lines, tokenized.themeFg),
        themeBg: tokenized.themeBg,
        themeFg: tokenized.themeFg,
      },
    }
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : 'Syntax tokenization failed',
    }
  }
}

// Serialize highlighter work inside the worker. This keeps grammar/theme
// loading deterministic when several blocks request a cold language at once.
let queue = Promise.resolve()
const cancelledRequests = new Set<number>()

self.onmessage = (event: MessageEvent<TokenizeWorkerMessage>) => {
  if (event.data.type === 'cancel') {
    cancelledRequests.add(event.data.id)
    setTimeout(() => cancelledRequests.delete(event.data.id), 60_000)
    return
  }

  const request = event.data
  queue = queue.then(async () => {
    if (cancelledRequests.delete(request.id)) return
    const response = await tokenize(request)
    if (!cancelledRequests.delete(request.id)) self.postMessage(response)
  })
}
