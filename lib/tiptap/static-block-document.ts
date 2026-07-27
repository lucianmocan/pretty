'use client'

import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import {
  initProseMirrorDoc,
  updateYFragment,
  ySyncPluginKey,
  yXmlFragmentToProsemirrorJSON,
} from '@tiptap/y-tiptap'
import type * as Y from 'yjs'
import { baseExtensions } from './extensions'
import {
  findMatchesInDocument,
  type LocalMatch,
} from './find-replace'

const schema = getSchema(baseExtensions())

function currentDocument(fragment: Y.XmlFragment) {
  return initProseMirrorDoc(fragment, schema)
}

function commitDocument(
  fragment: Y.XmlFragment,
  document: ReturnType<typeof currentDocument>['doc'],
  meta: ReturnType<typeof currentDocument>['meta']
) {
  const ydoc = fragment.doc
  if (!ydoc) throw new Error('Cannot update a detached block fragment')

  const transactionHost = {
    transact(callback: () => void) {
      ydoc.transact((transaction) => {
        transaction.meta.set('addToHistory', true)
        callback()
      }, ySyncPluginKey)
    },
  }
  updateYFragment(transactionHost, fragment, document, meta)
}

export function staticBlockJSON(fragment: Y.XmlFragment) {
  return yXmlFragmentToProsemirrorJSON(fragment)
}

export function staticBlockText(fragment: Y.XmlFragment): string {
  return currentDocument(fragment).doc.textContent
}

export function findMatchesInStaticBlock(
  fragment: Y.XmlFragment,
  query: string
): LocalMatch[] {
  return findMatchesInDocument(currentDocument(fragment).doc, query)
}

export function replaceMatchInStaticBlock(
  fragment: Y.XmlFragment,
  match: LocalMatch,
  replacement: string
) {
  const current = currentDocument(fragment)
  const state = EditorState.create({ schema, doc: current.doc })
  const transaction = replacement
    ? state.tr.replaceWith(match.from, match.to, schema.text(replacement))
    : state.tr.delete(match.from, match.to)
  commitDocument(fragment, transaction.doc, current.meta)
}

export function replaceAllInStaticBlock(
  fragment: Y.XmlFragment,
  query: string,
  replacement: string
): number {
  const current = currentDocument(fragment)
  const matches = findMatchesInDocument(current.doc, query)
  if (matches.length === 0) return 0

  let transaction = EditorState.create({ schema, doc: current.doc }).tr
  for (const match of [...matches].reverse()) {
    transaction = replacement
      ? transaction.replaceWith(match.from, match.to, schema.text(replacement))
      : transaction.delete(match.from, match.to)
  }
  commitDocument(fragment, transaction.doc, current.meta)
  return matches.length
}
