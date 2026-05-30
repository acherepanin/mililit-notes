import { EditorContent } from '@tiptap/react';
import { FileWarning, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { publicApi } from '../../api';
import { AmbientCubes } from '../../components/AmbientCubes';
import { createCopyFieldLabels } from '../../editor/copyFieldLabels';
import { EditorLinkTooltip } from '../../editor/EditorLinkTooltip';
import { useNotebookEditor } from '../../editor/useNotebookEditor';
import type { Translator } from '../../i18n';
import type { PublicShare } from '../../types';
import { sanitizeHtml } from '../../utils/html';

interface PublicSharePageProps {
  token: string;
  t: Translator;
}

export function PublicSharePage({ token, t }: PublicSharePageProps) {
  const editorWrapRef = useRef<HTMLElement | null>(null);
  const [share, setShare] = useState<PublicShare | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const copyFieldLabels = useMemo(() => createCopyFieldLabels(t), [t]);
  const editor = useNotebookEditor({
    onContentChange: () => undefined,
    placeholder: '',
    copyFieldLabels,
  });
  const contentHtml = useMemo(
    () => sanitizeHtml(share?.note.contentHtml || '<p></p>'),
    [share?.note.contentHtml],
  );

  useEffect(() => {
    let isActive = true;

    setIsLoading(true);
    setIsUnavailable(false);

    publicApi
      .getShare(token)
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setShare(payload);
        document.title = payload.note.name;
      })
      .catch(() => {
        if (isActive) {
          setIsUnavailable(true);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!editor || !share) {
      return;
    }

    editor.commands.setContent(contentHtml);
    editor.setEditable(false);
  }, [contentHtml, editor, share]);

  return (
    <main className="public-share-page">
      <AmbientCubes area="workspace" />
      {isLoading ? (
        <section className="public-share-state" aria-busy="true">
          <Loader2 className="boot-spinner" size={28} />
        </section>
      ) : null}

      {!isLoading && isUnavailable ? (
        <section className="public-share-state" aria-labelledby="public-share-error-title">
          <FileWarning size={26} aria-hidden />
          <h1 id="public-share-error-title" className="public-share-state__title">
            {t('publicShareUnavailableTitle')}
          </h1>
          <p>{t('publicShareUnavailable')}</p>
        </section>
      ) : null}

      {!isLoading && share ? (
        <article className="public-share-card">
          <header className="public-share-card__head">
            <h1>{share.note.name}</h1>
            <span>
              {t('updated')} {new Date(share.note.updatedAt).toLocaleString()} /{' '}
              {t('shareExpiresAt')} {new Date(share.expiresAt).toLocaleString()}
            </span>
          </header>
          <section
            className="editor-wrap editor-wrap--preview public-share-content"
            ref={editorWrapRef}
          >
            <EditorContent editor={editor} />
          </section>
          <EditorLinkTooltip containerRef={editorWrapRef} isEditing={false} />
        </article>
      ) : null}
    </main>
  );
}
