import { EditorContent } from '@tiptap/react';
import { Link2, Trash2, Undo2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AmbientCubes } from '../../components/AmbientCubes';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { RichTextToolbar } from '../../editor/RichTextToolbar';
import { createCopyFieldLabels } from '../../editor/copyFieldLabels';
import { EditorLinkTooltip } from '../../editor/EditorLinkTooltip';
import { formatCurrentCodeBlock } from '../../editor/editorCode';
import { useNotebookEditor } from '../../editor/useNotebookEditor';
import type { Translator } from '../../i18n';
import type { AuthUser, UserLanguage, UserTheme } from '../../types';
import type { ToastKind } from '../../components/useToasts';
import { escapeHtml } from '../../utils/html';
import { Sidebar } from '../notes/Sidebar';
import { Topbar } from '../notes/Topbar';
import { useAppShortcuts, useShortcutItems } from '../notes/useAppShortcuts';
import { useNotesWorkspace } from '../notes/useNotesWorkspace';

const AdminPanel = lazy(() =>
  import('../admin/AdminPanel').then((module) => ({ default: module.AdminPanel })),
);

type ActiveModal = { type: 'delete' } | { type: 'link' } | null;
type WorkspaceView = 'notes' | 'admin';

interface AuthenticatedAppProps {
  user: AuthUser;
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onLogout: () => void;
  pushToast: (kind: ToastKind, message: string, ttl?: number) => void;
}

export default function AuthenticatedApp({
  user,
  language,
  theme,
  t,
  onLanguageChange,
  onThemeChange,
  onLogout,
  pushToast,
}: AuthenticatedAppProps) {
  const copyFieldLabels = useMemo(() => createCopyFieldLabels(t), [t]);
  const workspace = useNotesWorkspace(true);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>('notes');
  const [isEditorEditing, setIsEditorEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const lastErrorRef = useRef<string | null>(null);
  const editorWrapRef = useRef<HTMLElement | null>(null);

  const editor = useNotebookEditor({
    onContentChange: workspace.updateDraftContent,
    placeholder: t('writeHere'),
    copyFieldLabels,
  });

  useEffect(() => {
    editor?.setEditable(isEditorEditing && Boolean(workspace.selectedNote));
    window.dispatchEvent(new CustomEvent('notes-editor-editable-change'));
  }, [editor, isEditorEditing, workspace.selectedNote]);

  useEffect(() => {
    if (!workspace.error || workspace.error === lastErrorRef.current) {
      return;
    }

    lastErrorRef.current = workspace.error;
    pushToast('error', t('loadError'));
  }, [pushToast, t, workspace.error]);

  useEffect(() => {
    if (user.role !== 'admin' && activeView === 'admin') {
      setActiveView('notes');
    }
  }, [activeView, user.role]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!workspace.selectedNote) {
      editor.commands.clearContent();
      return;
    }

    editor.commands.setContent(workspace.selectedNote.contentHtml || '<p></p>');
  }, [editor, workspace.selectedNote]);

  const saveEditorContent = useCallback(async () => {
    if (!editor) {
      return;
    }

    try {
      await workspace.saveCurrentNote(editor.getHTML(), editor.getText());
      pushToast('success', t('saved'));
    } catch (caught: unknown) {
      workspace.setActionError(caught, t('saveError'));
      pushToast('error', t('saveError'));
    }
  }, [editor, pushToast, t, workspace]);

  const insertCopyField = useCallback(() => {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'copyField',
        attrs: {
          label: t('copy'),
          value: '',
        },
      })
      .run();
  }, [editor, t]);

  const insertSecretField = useCallback(() => {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'copyField',
        attrs: {
          label: t('fieldKindPassword'),
          value: '',
          kind: 'password',
          secret: true,
        },
      })
      .run();
  }, [editor, t]);

  const toggleCodeBlock = useCallback(() => {
    editor?.chain().focus().toggleCodeBlock().run();
  }, [editor]);

  const formatEditorCode = useCallback(() => {
    try {
      const isFormatted = formatCurrentCodeBlock(editor);
      pushToast(
        isFormatted ? 'success' : 'error',
        isFormatted ? t('codeFormatted') : t('codeFormatFailed'),
      );
    } catch {
      pushToast('error', t('codeFormatFailed'));
    }
  }, [editor, pushToast, t]);

  const createDefaultNote = useCallback(
    (parentId: number | null) => {
      workspace
        .createNote(t('defaultNoteName'), parentId)
        .then(() => {
          pushToast('success', t('saved'));
        })
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('createError'));
          pushToast('error', t('createError'));
        });
    },
    [pushToast, t, workspace],
  );

  const renameTreeNote = useCallback(
    (id: number, name: string) => {
      workspace
        .renameNote(id, name)
        .then(() => {
          pushToast('success', t('saved'));
        })
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('saveError'));
          pushToast('error', t('saveError'));
        });
    },
    [pushToast, t, workspace],
  );

  const deleteTreeNote = useCallback(
    (id: number) => {
      workspace
        .deleteNote(id)
        .then(() => {
          pushToast('success', t('delete'));
        })
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('deleteError'));
          pushToast('error', t('deleteError'));
        });
    },
    [pushToast, t, workspace],
  );

  const submitDelete = () => {
    workspace
      .deleteCurrentNote()
      .then(() => {
        editor?.commands.clearContent();
        setActiveModal(null);
        pushToast('success', t('delete'));
      })
      .catch((caught: unknown) => {
        workspace.setActionError(caught, t('deleteError'));
        pushToast('error', t('deleteError'));
      });
  };

  const openLinkModal = useCallback(() => {
    const currentHref = editor?.getAttributes('link').href as string | undefined;
    setLinkUrl(currentHref ?? '');
    setLinkText('');
    setActiveModal({ type: 'link' });
  }, [editor]);

  const submitLink = () => {
    if (!editor) {
      return;
    }

    if (!linkUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setActiveModal(null);
      return;
    }

    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent(
          `<a href="${escapeHtml(linkUrl.trim())}">${escapeHtml(linkText.trim() || linkUrl.trim())}</a>`,
        )
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    }

    setActiveModal(null);
  };

  const dropDraggedNote = useCallback(
    (parentId: number | null) => {
      workspace.moveDraggedNote(parentId).catch((caught: unknown) => {
        workspace.setActionError(caught, t('moveError'));
        pushToast('error', t('moveError'));
      });
    },
    [pushToast, t, workspace],
  );

  const shortcutItems = useShortcutItems(t);
  useAppShortcuts({
    activeModal: Boolean(activeModal),
    createDefaultNote,
    editor,
    formatEditorCode,
    insertCopyField,
    insertSecretField,
    isAuthenticated: true,
    isEditorEditing,
    language,
    openLinkModal,
    saveEditorContent,
    selectedId: workspace.selectedId,
    setMobileTreeOpen: workspace.setMobileTreeOpen,
    theme,
    toggleCodeBlock,
    updateLanguage: onLanguageChange,
    updateTheme: onThemeChange,
  });

  return (
    <main className="app-shell">
      <Sidebar
        tree={workspace.visibleTree}
        query={workspace.query}
        totalNotes={workspace.totalNotes}
        selectedId={workspace.selectedId}
        expanded={workspace.expanded}
        draggedId={workspace.draggedId}
        status={workspace.status}
        isOpen={workspace.mobileTreeOpen}
        language={language}
        theme={theme}
        t={t}
        isAdmin={user.role === 'admin'}
        activeView={activeView}
        onClose={() => workspace.setMobileTreeOpen(false)}
        onOpenNotes={() => {
          setActiveView('notes');
          workspace.selectFirstNote();
          workspace.setMobileTreeOpen(false);
        }}
        onOpenAdmin={() => {
          setActiveView('admin');
          workspace.setMobileTreeOpen(false);
        }}
        onQueryChange={workspace.setQuery}
        onCreateNote={() => createDefaultNote(workspace.selectedId)}
        onSelectRoot={workspace.selectRoot}
        onDropRoot={() => dropDraggedNote(null)}
        onToggleNode={workspace.toggleExpanded}
        onSelectNode={(id) => {
          setActiveView('notes');
          workspace.selectNote(id);
        }}
        onRenameNode={renameTreeNote}
        onDeleteNode={deleteTreeNote}
        onDragStart={workspace.setDraggedId}
        onDropNode={dropDraggedNote}
        onLanguageToggle={() => onLanguageChange(language === 'ru' ? 'en' : 'ru')}
        onThemeToggle={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
        onLogout={onLogout}
      />

      <section
        className={`workspace ${activeView === 'admin' && user.role === 'admin' ? 'workspace--admin' : ''}`}
      >
        <AmbientCubes area="workspace" />
        {activeView === 'admin' && user.role === 'admin' ? (
          <Suspense fallback={<div className="empty-editor">{t('loading')}</div>}>
            <AdminPanel
              currentUserId={user.id}
              t={t}
              language={language}
              onOpenSidebar={() => workspace.setMobileTreeOpen((isOpen) => !isOpen)}
              onError={(message) => pushToast('error', message)}
              onSuccess={(message) => pushToast('success', message)}
            />
          </Suspense>
        ) : (
          <>
            <Topbar
              selectedNote={workspace.selectedNote}
              draft={workspace.draft}
              t={t}
              language={language}
              shortcuts={shortcutItems}
              isEditing={isEditorEditing}
              onOpenSidebar={() => workspace.setMobileTreeOpen((isOpen) => !isOpen)}
              onDraftNameChange={workspace.updateDraftName}
              onSave={() => void saveEditorContent()}
              onDelete={() => setActiveModal({ type: 'delete' })}
            />

            <RichTextToolbar
              editor={editor}
              t={t}
              isEditing={isEditorEditing}
              onModeChange={setIsEditorEditing}
              onOpenLink={openLinkModal}
              onInsertCopyField={insertCopyField}
              onInsertSecretField={insertSecretField}
            />

            <section
              className={`editor-wrap ${isEditorEditing ? 'editor-wrap--edit' : 'editor-wrap--preview'}`}
              ref={editorWrapRef}
            >
              {workspace.selectedNote ? (
                <EditorContent editor={editor} />
              ) : (
                <div className="empty-editor">{t('emptyEditor')}</div>
              )}
            </section>
            <EditorLinkTooltip containerRef={editorWrapRef} isEditing={isEditorEditing} />
          </>
        )}
      </section>

      <Modal
        isOpen={activeModal?.type === 'delete'}
        title={t('delete')}
        closeLabel={t('close')}
        onClose={() => setActiveModal(null)}
      >
        <div className="modal-form">
          <p>{t('deleteQuestion')}</p>
          <div className="modal-actions">
            <IconButton
              label={t('cancel')}
              icon={<Undo2 size={16} />}
              onClick={() => setActiveModal(null)}
            />
            <IconButton
              label={t('delete')}
              icon={<Trash2 size={16} />}
              variant="danger"
              onClick={submitDelete}
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal?.type === 'link'}
        title={t('applyLink')}
        closeLabel={t('close')}
        onClose={() => setActiveModal(null)}
      >
        <div className="modal-form">
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder={t('linkUrl')}
            autoFocus
          />
          <input
            value={linkText}
            onChange={(event) => setLinkText(event.target.value)}
            placeholder={t('linkText')}
          />
          <div className="modal-actions">
            <IconButton
              label={t('cancel')}
              icon={<Undo2 size={16} />}
              onClick={() => setActiveModal(null)}
            />
            <IconButton
              label={t('applyLink')}
              icon={<Link2 size={16} />}
              variant="primary"
              onClick={submitLink}
            />
          </div>
        </div>
      </Modal>
    </main>
  );
}
