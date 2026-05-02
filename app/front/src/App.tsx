import { EditorContent } from '@tiptap/react';
import { Link2, Loader2, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from './components/IconButton';
import { Modal } from './components/Modal';
import { ToastHost } from './components/ToastHost';
import { useToasts } from './components/useToasts';
import { RichTextToolbar } from './editor/RichTextToolbar';
import { EditorLinkTooltip } from './editor/EditorLinkTooltip';
import { formatCurrentCodeBlock } from './editor/editorCode';
import { useNotebookEditor } from './editor/useNotebookEditor';
import { AdminPanel } from './features/admin/AdminPanel';
import { LoginScreen } from './features/auth/LoginScreen';
import { useAuth } from './features/auth/useAuth';
import { Sidebar } from './features/notes/Sidebar';
import { Topbar } from './features/notes/Topbar';
import { useNotesWorkspace } from './features/notes/useNotesWorkspace';
import { createTranslator } from './i18n';
import type { UserLanguage, UserTheme } from './types';
import { escapeHtml } from './utils/html';

type ActiveModal = { type: 'delete' } | { type: 'link' } | null;
type WorkspaceView = 'notes' | 'admin';

const guestLanguageKey = 'notes.guest.language';
const guestThemeKey = 'notes.guest.theme';

export function App() {
  const auth = useAuth();
  const [guestLanguage, setGuestLanguage] = useState<UserLanguage>(
    () => (localStorage.getItem(guestLanguageKey) as UserLanguage) || 'ru',
  );
  const [guestTheme, setGuestTheme] = useState<UserTheme>(
    () => (localStorage.getItem(guestThemeKey) as UserTheme) || 'dark',
  );
  const language = auth.user?.language ?? guestLanguage;
  const theme = auth.user?.theme ?? guestTheme;
  const t = useMemo(() => createTranslator(language), [language]);
  const copyFieldLabels = useMemo(
    () => ({
      defaultLabel: t('copy'),
      copiedLabel: t('copied'),
      fieldLabel: t('fieldLabel'),
      fieldValue: t('fieldValue'),
      fieldLabelPlaceholder: t('fieldLabelPlaceholder'),
      fieldValuePlaceholder: t('fieldValuePlaceholder'),
      fieldKind: t('fieldKind'),
      fieldKindText: t('fieldKindText'),
      fieldKindLogin: t('fieldKindLogin'),
      fieldKindPassword: t('fieldKindPassword'),
      fieldKindCredential: t('fieldKindCredential'),
      fieldKindToken: t('fieldKindToken'),
      fieldKindUrl: t('fieldKindUrl'),
      generatePassword: t('generatePassword'),
      copy: t('copy'),
    }),
    [t],
  );
  const workspace = useNotesWorkspace(Boolean(auth.user));
  const toasts = useToasts();
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
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [language, theme]);

  useEffect(() => {
    localStorage.setItem(guestLanguageKey, guestLanguage);
  }, [guestLanguage]);

  useEffect(() => {
    localStorage.setItem(guestThemeKey, guestTheme);
  }, [guestTheme]);

  useEffect(() => {
    if (!workspace.error || workspace.error === lastErrorRef.current) {
      return;
    }

    lastErrorRef.current = workspace.error;
    toasts.pushToast('error', t('loadError'));
  }, [t, toasts, workspace.error]);

  useEffect(() => {
    if (auth.user?.role !== 'admin' && activeView === 'admin') {
      setActiveView('notes');
    }
  }, [activeView, auth.user?.role]);

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

  const updateLanguage = useCallback(
    (nextLanguage: UserLanguage) => {
      if (!auth.user) {
        setGuestLanguage(nextLanguage);
        return;
      }

      auth
        .updatePreferences({ language: nextLanguage })
        .then(() => toasts.pushToast('success', t('preferencesSaved')))
        .catch(() => toasts.pushToast('error', t('saveError')));
    },
    [auth, t, toasts],
  );

  const updateTheme = useCallback(
    (nextTheme: UserTheme) => {
      if (!auth.user) {
        setGuestTheme(nextTheme);
        return;
      }

      auth
        .updatePreferences({ theme: nextTheme })
        .then(() => toasts.pushToast('success', t('preferencesSaved')))
        .catch(() => toasts.pushToast('error', t('saveError')));
    },
    [auth, t, toasts],
  );

  const login = useCallback(
    (username: string, password: string) => {
      auth
        .login(username, password)
        .then((user) => {
          toasts.pushToast('success', user.username);
        })
        .catch(() => toasts.pushToast('error', t('loginError')));
    },
    [auth, t, toasts],
  );

  const saveEditorContent = useCallback(async () => {
    if (!editor) {
      return;
    }

    try {
      await workspace.saveCurrentNote(editor.getHTML(), editor.getText());
      toasts.pushToast('success', t('saved'));
    } catch (caught: unknown) {
      workspace.setActionError(caught, t('saveError'));
      toasts.pushToast('error', t('saveError'));
    }
  }, [editor, t, toasts, workspace]);

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
      toasts.pushToast(
        isFormatted ? 'success' : 'error',
        isFormatted ? t('codeFormatted') : t('codeFormatFailed'),
      );
    } catch {
      toasts.pushToast('error', t('codeFormatFailed'));
    }
  }, [editor, t, toasts]);

  const createDefaultNote = useCallback(
    (parentId: number | null) => {
      workspace
        .createNote(t('defaultNoteName'), parentId)
        .then(() => {
          toasts.pushToast('success', t('saved'));
        })
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('createError'));
          toasts.pushToast('error', t('createError'));
        });
    },
    [t, toasts, workspace],
  );

  const renameTreeNote = useCallback(
    (id: number, name: string) => {
      workspace
        .renameNote(id, name)
        .then(() => {
          toasts.pushToast('success', t('saved'));
        })
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('saveError'));
          toasts.pushToast('error', t('saveError'));
        });
    },
    [t, toasts, workspace],
  );

  const deleteTreeNote = useCallback(
    (id: number) => {
      workspace
        .deleteNote(id)
        .then(() => {
          toasts.pushToast('success', t('delete'));
        })
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('deleteError'));
          toasts.pushToast('error', t('deleteError'));
        });
    },
    [t, toasts, workspace],
  );

  const submitDelete = () => {
    workspace
      .deleteCurrentNote()
      .then(() => {
        editor?.commands.clearContent();
        setActiveModal(null);
        toasts.pushToast('success', t('delete'));
      })
      .catch((caught: unknown) => {
        workspace.setActionError(caught, t('deleteError'));
        toasts.pushToast('error', t('deleteError'));
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
        toasts.pushToast('error', t('moveError'));
      });
    },
    [t, toasts, workspace],
  );

  const shortcutItems = useMemo(
    () => [
      { keys: ['Ctrl', 'S'], label: t('shortcutSave') },
      { keys: ['Ctrl', 'Alt', 'N'], label: t('shortcutNewFocused') },
      { keys: ['Ctrl', '/'], label: t('shortcutSearch') },
      { keys: ['Ctrl', 'K'], label: t('shortcutLink') },
      { keys: ['Ctrl', 'Alt', 'F'], label: t('shortcutFormatCode') },
      { keys: ['Ctrl', 'Alt', '`'], label: t('shortcutCodeBlock') },
      { keys: ['Ctrl', 'Alt', 'C'], label: t('shortcutCopyField') },
      { keys: ['Ctrl', 'Alt', 'P'], label: t('shortcutSecretField') },
      { keys: ['Ctrl', 'Alt', 'T'], label: t('shortcutTheme') },
      { keys: ['Ctrl', 'Alt', 'G'], label: t('shortcutLanguage') },
      { keys: ['Ctrl', '\\'], label: t('shortcutSidebar') },
      { keys: ['Ctrl', 'B'], label: t('shortcutBold') },
      { keys: ['Ctrl', 'I'], label: t('shortcutItalic') },
      { keys: ['Ctrl', 'U'], label: t('shortcutUnderline') },
      { keys: ['Ctrl', 'Z'], label: t('shortcutUndo') },
      { keys: ['Ctrl', 'Y'], label: t('shortcutRedo') },
    ],
    [t],
  );

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const primary = event.ctrlKey || event.metaKey;
      const code = event.code;

      if (!primary || !auth.user) {
        return;
      }

      if (code === 'KeyS') {
        event.preventDefault();
        if (isEditorEditing) {
          void saveEditorContent();
        }
        return;
      }

      if (activeModal) {
        return;
      }

      if (!event.altKey && isEditorEditing) {
        if (code === 'KeyB') {
          event.preventDefault();
          editor?.chain().focus().toggleBold().run();
          return;
        }

        if (code === 'KeyI') {
          event.preventDefault();
          editor?.chain().focus().toggleItalic().run();
          return;
        }

        if (code === 'KeyU') {
          event.preventDefault();
          editor?.chain().focus().toggleUnderline().run();
          return;
        }

        if (code === 'KeyZ') {
          event.preventDefault();
          editor?.chain().focus().undo().run();
          return;
        }

        if (code === 'KeyY') {
          event.preventDefault();
          editor?.chain().focus().redo().run();
          return;
        }
      }

      if (event.altKey && code === 'KeyN') {
        event.preventDefault();
        createDefaultNote(workspace.selectedId);
        return;
      }

      if (code === 'Slash') {
        event.preventDefault();
        workspace.setMobileTreeOpen(true);
        document.querySelector<HTMLInputElement>('.search-box input')?.focus();
        return;
      }

      if (code === 'KeyK') {
        event.preventDefault();
        if (isEditorEditing) {
          openLinkModal();
        }
        return;
      }

      if (event.altKey && code === 'KeyF') {
        event.preventDefault();
        if (isEditorEditing) {
          formatEditorCode();
        }
        return;
      }

      if (event.altKey && event.code === 'Backquote') {
        event.preventDefault();
        if (isEditorEditing) {
          toggleCodeBlock();
        }
        return;
      }

      if (event.altKey && code === 'KeyC') {
        event.preventDefault();
        if (isEditorEditing) {
          insertCopyField();
        }
        return;
      }

      if (event.altKey && code === 'KeyP') {
        event.preventDefault();
        if (isEditorEditing) {
          insertSecretField();
        }
        return;
      }

      if (event.altKey && code === 'KeyT') {
        event.preventDefault();
        updateTheme(theme === 'dark' ? 'light' : 'dark');
        return;
      }

      if (event.altKey && code === 'KeyG') {
        event.preventDefault();
        updateLanguage(language === 'ru' ? 'en' : 'ru');
        return;
      }

      if (code === 'Backslash') {
        event.preventDefault();
        workspace.setMobileTreeOpen(true);
      }
    };

    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [
    activeModal,
    auth.user,
    createDefaultNote,
    editor,
    formatEditorCode,
    insertCopyField,
    insertSecretField,
    isEditorEditing,
    language,
    openLinkModal,
    saveEditorContent,
    theme,
    toggleCodeBlock,
    updateLanguage,
    updateTheme,
    workspace,
  ]);

  if (auth.isChecking) {
    return (
      <main className="auth-stage">
        <Loader2 className="boot-spinner" size={28} />
      </main>
    );
  }

  if (!auth.user) {
    return (
      <>
        <LoginScreen
          language={language}
          theme={theme}
          t={t}
          isLoading={auth.isChecking}
          onLanguageChange={updateLanguage}
          onThemeChange={updateTheme}
          onLogin={login}
        />
        <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
      </>
    );
  }

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
        isAdmin={auth.user.role === 'admin'}
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
        onLanguageToggle={() => updateLanguage(language === 'ru' ? 'en' : 'ru')}
        onThemeToggle={() => updateTheme(theme === 'dark' ? 'light' : 'dark')}
        onLogout={auth.logout}
      />

      <section
        className={`workspace ${activeView === 'admin' && auth.user.role === 'admin' ? 'workspace--admin' : ''}`}
      >
        {activeView === 'admin' && auth.user.role === 'admin' ? (
          <AdminPanel
            currentUserId={auth.user.id}
            t={t}
            language={language}
            onOpenSidebar={() => workspace.setMobileTreeOpen((isOpen) => !isOpen)}
            onError={(message) => toasts.pushToast('error', message)}
            onSuccess={(message) => toasts.pushToast('success', message)}
          />
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
              onFormatCode={formatEditorCode}
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

      <ToastHost toasts={toasts.toasts} closeLabel={t('close')} onDismiss={toasts.dismiss} />
    </main>
  );
}
