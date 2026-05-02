import Placeholder from '@tiptap/extension-placeholder';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { all, createLowlight } from 'lowlight';
import { useMemo } from 'react';

import { CodeBlockWithTools } from './codeBlockExtension';
import { createCopyField, type CopyFieldLabels } from './CopyField';

const lowlight = createLowlight(all);

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
      },
      onUpdate: ({ editor }) => {
        onContentChange(editor.getHTML(), editor.getText());
      },
    },
    [placeholder, copyField],
  );
}
