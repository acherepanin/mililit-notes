import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';

import { CustomSelect } from '../components/CustomSelect';
import { createTranslator } from '../i18n';
import type { UserLanguage } from '../types';
import { autoCodeLanguage, codeLanguages, knownCodeLanguages, type CodeLanguage } from './codeLanguages';

function getDocumentLanguage(): UserLanguage {
  return document.documentElement.lang === 'en' ? 'en' : 'ru';
}

export function CodeBlockView({ editor, node, updateAttributes }: ReactNodeViewProps) {
  const [language, setLanguage] = useState<UserLanguage>(() => getDocumentLanguage());
  const [isEditable, setIsEditable] = useState(() => editor.isEditable);
  const t = useMemo(() => createTranslator(language), [language]);
  const rawLanguage = (node.attrs.language as string | null | undefined) || autoCodeLanguage;
  const selectedLanguage: CodeLanguage = knownCodeLanguages.has(rawLanguage) ? (rawLanguage as CodeLanguage) : autoCodeLanguage;

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

  return (
    <NodeViewWrapper className="code-block-view" data-language={selectedLanguage}>
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
      </div>
      <pre>
        <NodeViewContent className="code-block-view__content" />
      </pre>
    </NodeViewWrapper>
  );
}
