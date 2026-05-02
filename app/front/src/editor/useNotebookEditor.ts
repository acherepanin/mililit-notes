import Placeholder from '@tiptap/extension-placeholder';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMemo } from 'react';

import { CodeBlockWithTools } from './codeBlockExtension';
import { createCopyField, type CopyFieldLabels } from './CopyField';
import { isSelectAllShortcut, selectCurrentCodeBlockText } from './editorCode';
import { lowlight } from './lowlight';

interface UseNotebookEditorParams {
  onContentChange: (contentHtml: string, contentText: string) => void;
  placeholder: string;
  copyFieldLabels: CopyFieldLabels;
}

export function useNotebookEditor({
  onContentChange,
  placeholder,
  copyFieldLabels,
}: UseNotebookEditorParams) {
  const copyField = useMemo(() => createCopyField(copyFieldLabels), [copyFieldLabels]);

  return useEditor(
    {
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          heading: {
            levels: [1, 2, 3],
          },
          link: {
            openOnClick: false,
            autolink: true,
            HTMLAttributes: {
              rel: 'noopener noreferrer',
              target: '_blank',
            },
          },
        }),
        Placeholder.configure({
          placeholder,
        }),
        CodeBlockWithTools.configure({
          lowlight,
          defaultLanguage: null,
        }),
        copyField,
      ],
      content: '',
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: 'editor-surface',
        },
        handleKeyDown: (view, event) =>
          isSelectAllShortcut(event) ? selectCurrentCodeBlockText(view) : false,
      },
      onUpdate: ({ editor }) => {
        onContentChange(editor.getHTML(), editor.getText());
      },
    },
    [placeholder, copyField],
  );
}
