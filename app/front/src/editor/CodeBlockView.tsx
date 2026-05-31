import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { Braces } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CustomSelect } from '../components/CustomSelect';
import { IconButton } from '../components/IconButton';
import { createTranslator } from '../i18n';
import type { UserLanguage } from '../types';
import {
  autoCodeLanguage,
  codeLanguages,
  knownCodeLanguages,
  type CodeLanguage,
} from './codeLanguages';
import { formatCodeBlockAt, isSelectAllShortcut, selectCodeBlockTextAt } from './editorCode';

function getDocumentLanguage(): UserLanguage {
  return document.documentElement.lang === 'en' ? 'en' : 'ru';
}

export function CodeBlockView({ editor, getPos, node, updateAttributes }: ReactNodeViewProps) {
  const [language, setLanguage] = useState<UserLanguage>(() => getDocumentLanguage());
  const [isEditable, setIsEditable] = useState(() => editor.isEditable);
  const t = useMemo(() => createTranslator(language), [language]);
  const rawLanguage = (node.attrs?.language as string | null | undefined) || autoCodeLanguage;
  const selectedLanguage: CodeLanguage = knownCodeLanguages.has(rawLanguage)
    ? (rawLanguage as CodeLanguage)
    : autoCodeLanguage;
  const lineNumbers = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, node.textContent.split('\n').length) },
        (_, index) => index + 1,
      ),
    [node.textContent],
  );

  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(getDocumentLanguage()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const refresh = () => setIsEditable(editor.isEditable);

    refresh();
    editor.on('transaction', refresh);
    editor.on('selectionUpdate', refresh);
    window.addEventListener('notes-editor-editable-change', refresh);

    return () => {
      editor.off('transaction', refresh);
      editor.off('selectionUpdate', refresh);
      window.removeEventListener('notes-editor-editable-change', refresh);
    };
  }, [editor]);

  const selectCodeOnly = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;

      if (!isSelectAllShortcut(event) || target?.closest('.code-block-view__head')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      selectCodeBlockTextAt(editor, getPos());
    },
    [editor, getPos],
  );

  return (
    <NodeViewWrapper
      className="code-block-view"
      data-language={selectedLanguage}
      onKeyDownCapture={selectCodeOnly}
    >
      <div className="code-block-view__head" contentEditable={false}>
        <CustomSelect
          className="code-block-view__select"
          label={t('codeLanguage')}
          value={selectedLanguage}
          options={codeLanguages.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
          disabled={!isEditable}
          onChange={(nextLanguage) => {
            updateAttributes({ language: nextLanguage === autoCodeLanguage ? null : nextLanguage });
          }}
        />
        <IconButton
          className="code-block-view__format"
          label={t('formatCode')}
          icon={<Braces />}
          disabled={!isEditable}
          onClick={() => formatCodeBlockAt(editor, getPos())}
        />
      </div>
      <pre>
        <span className="code-block-view__lines" contentEditable={false} aria-hidden="true">
          {lineNumbers.map((lineNumber) => (
            <span key={lineNumber}>{lineNumber}</span>
          ))}
        </span>
        <NodeViewContent className="code-block-view__content" />
      </pre>
    </NodeViewWrapper>
  );
}
