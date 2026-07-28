import StarterKit from '@tiptap/starter-kit'
import { AnnotatedCodeBlock } from './extensions/annotated-code-block'
import { SyntaxColorMark } from './extensions/syntax-color-mark'
import { FormatMark } from './extensions/format-mark'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TextAlign } from './extensions/text-align'

/**
 * Shared between the live editor and the print route's renderToReactElement
 * call, so the two can never visually diverge -- same node/mark renderHTML
 * definitions produce the markup in both places.
 */
export function baseExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false, // replaced by AnnotatedCodeBlock, which allows marks
      undoRedo: false, // Yjs/Collaboration owns undo history instead
      trailingNode: false, // each block's mini-doc holds exactly one top-level node
      link: {
        openOnClick: false,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    AnnotatedCodeBlock,
    SyntaxColorMark,
    FormatMark,
    TextAlign,
  ]
}
