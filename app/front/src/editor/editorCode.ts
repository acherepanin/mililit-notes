import type { Editor } from '@tiptap/react';

import { formatCodeText } from '../utils/codeFormatting';
import { autoCodeLanguage } from './codeLanguages';

export function formatCurrentCodeBlock(editor: Editor | null): boolean {
  if (!editor) {
    return false;
  }

  const { state, view } = editor;
  const { $from } = state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name !== 'codeBlock') {
      continue;
    }

    const nodeStart = $from.before(depth);
    const from = nodeStart + 1;
    const to = nodeStart + node.nodeSize - 1;
    const language = (node.attrs.language as string | null | undefined) || autoCodeLanguage;
    const formatted = formatCodeText(node.textContent, language);

    if (formatted === node.textContent) {
      return true;
    }

    view.dispatch(state.tr.insertText(formatted, from, to));
    return true;
  }

  return false;
}
