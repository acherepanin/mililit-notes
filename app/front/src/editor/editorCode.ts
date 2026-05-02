import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { formatCodeText } from '../utils/codeFormatting';
import { autoCodeLanguage } from './codeLanguages';

interface CodeBlockTextRange {
  from: number;
  to: number;
  position: number;
  node: ProseMirrorNode;
}

interface SelectAllShortcutEvent {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
}

export function isSelectAllShortcut(event: SelectAllShortcutEvent): boolean {
  const key = event.key.toLocaleLowerCase();

  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    (event.code === 'KeyA' || key === 'a' || key === 'ф')
  );
}

function getCodeBlockRangeAtPosition(
  state: EditorState,
  position: number,
): CodeBlockTextRange | null {
  const node = state.doc.nodeAt(position);

  if (!node || node.type.name !== 'codeBlock') {
    return null;
  }

  return {
    from: position + 1,
    to: position + node.nodeSize - 1,
    position,
    node,
  };
}

function getCodeBlockRangeFromResolvedPosition(
  state: EditorState,
  position: number,
): CodeBlockTextRange | null {
  const resolvedPosition = state.doc.resolve(position);

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    const node = resolvedPosition.node(depth);

    if (node.type.name === 'codeBlock') {
      return getCodeBlockRangeAtPosition(state, resolvedPosition.before(depth));
    }
  }

  return null;
}

function getActiveCodeBlockTextRange(state: EditorState): CodeBlockTextRange | null {
  const { selection } = state;
  const nodeRange = getCodeBlockRangeAtPosition(state, selection.from);

  if (nodeRange && selection.to === nodeRange.to + 1) {
    return nodeRange;
  }

  const anchorRange = getCodeBlockRangeFromResolvedPosition(state, selection.anchor);
  const headRange = getCodeBlockRangeFromResolvedPosition(state, selection.head);

  if (!anchorRange || !headRange || anchorRange.position !== headRange.position) {
    return null;
  }

  return anchorRange;
}

function formatCodeBlockNode(editor: Editor, position: number): boolean {
  const { state, view } = editor;
  const range = getCodeBlockRangeAtPosition(state, position);

  if (!range) {
    return false;
  }

  const language = (range.node.attrs.language as string | null | undefined) || autoCodeLanguage;
  const formatted = formatCodeText(range.node.textContent, language);

  if (formatted === range.node.textContent) {
    return true;
  }

  view.dispatch(state.tr.insertText(formatted, range.from, range.to));
  view.focus();
  return true;
}

export function formatCodeBlockAt(editor: Editor | null, position: number | undefined): boolean {
  if (!editor || typeof position !== 'number') {
    return false;
  }

  return formatCodeBlockNode(editor, position);
}

export function selectCurrentCodeBlockText(view: EditorView): boolean {
  const { state } = view;
  const range = getActiveCodeBlockTextRange(state);

  if (!range) {
    return false;
  }

  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)));
  return true;
}

export function selectCodeBlockTextAt(
  editor: Editor | null,
  position: number | undefined,
): boolean {
  if (!editor || typeof position !== 'number') {
    return false;
  }

  const { state, view } = editor;
  const range = getCodeBlockRangeAtPosition(state, position);

  if (!range) {
    return false;
  }

  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)));
  view.focus();
  return true;
}

export function formatCurrentCodeBlock(editor: Editor | null): boolean {
  if (!editor) {
    return false;
  }

  const { state } = editor;
  const { $from } = state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);

    if (node.type.name !== 'codeBlock') {
      continue;
    }

    return formatCodeBlockNode(editor, $from.before(depth));
  }

  return false;
}
