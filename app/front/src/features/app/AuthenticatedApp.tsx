import { EditorContent } from '@tiptap/react';
import {
  Bot,
  FilePlus2,
  Files,
  Languages,
  Link2,
  Palette,
  PanelLeft,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { aiApi, notesApi, workspaceApi } from '../../api';
import { DeleteConfirmationProvider, useConfirmDelete } from '../../components/DeleteConfirmationProvider';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { RichTextToolbar } from '../../editor/RichTextToolbar';
import { createCopyFieldLabels } from '../../editor/copyFieldLabels';
import { EditorLinkTooltip } from '../../editor/EditorLinkTooltip';
import { formatCurrentCodeBlock } from '../../editor/editorCode';
import { useNotebookEditor } from '../../editor/useNotebookEditor';
import type { Translator } from '../../i18n';
import { getNextTheme } from '../../themes';
import type { AiSettings, MeUser, NoteTreeNode, Tag, UserLanguage, UserTheme } from '../../types';
import type { ToastKind } from '../../components/useToasts';
import { escapeHtml } from '../../utils/html';
import { AiAssistant } from '../ai/AiAssistant';
import { CommandPalette, type CommandPaletteItem } from './CommandPalette';
import {
  AttachmentsPanel,
  ShareLinksPanel,
  TemplatesPanel,
  TrashPanel,
  VersionsPanel,
} from '../notes/NoteToolPanels';
import { Sidebar } from '../notes/Sidebar';
import { Topbar } from '../notes/Topbar';
import { useAppShortcuts, useShortcutItems } from '../notes/useAppShortcuts';
import { useNotesWorkspace } from '../notes/useNotesWorkspace';
import { downloadJsonFile, validateJsonExportPayload } from './jsonBackup';

type ActiveModal =
  | { type: 'link' }
  | { type: 'trash' }
  | { type: 'versions' }
  | { type: 'templates' }
  | { type: 'share' }
  | { type: 'attachments' }
  | { type: 'accountAttachments' }
  | null;
interface AuthenticatedAppProps {
  user: MeUser;
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  onLogout: () => void;
  pushToast: (kind: ToastKind, message: string, ttl?: number) => void;
}

export default function AuthenticatedApp(props: AuthenticatedAppProps) {
  return (
    <DeleteConfirmationProvider t={props.t}>
      <AuthenticatedAppMain {...props} />
    </DeleteConfirmationProvider>
  );
}

function findNoteName(nodes: NoteTreeNode[], id: number): string | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node.name;
    }
    const childName = findNoteName(node.children, id);
    if (childName) {
      return childName;
    }
  }
  return null;
}

function AuthenticatedAppMain({
  user,
  language,
  theme,
  t,
  onLanguageChange,
  onThemeChange,
  onLogout,
  pushToast,
}: AuthenticatedAppProps) {
  const confirmDelete = useConfirmDelete();
  const navigate = useNavigate();
  const copyFieldLabels = useMemo(() => createCopyFieldLabels(t), [t]);
  const workspace = useNotesWorkspace(true);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [isEditorEditing, setIsEditorEditing] = useState(false);
  const [globalTags, setGlobalTags] = useState<Tag[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [aiChatOpenSignal, setAiChatOpenSignal] = useState(0);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const lastErrorRef = useRef<string | null>(null);
  const editorWrapRef = useRef<HTMLElement | null>(null);
  const globalTagNames = useMemo(() => globalTags.map((tag) => tag.name), [globalTags]);

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

  const refreshGlobalTags = useCallback(async () => {
    const tags = await notesApi.listTags();
    setGlobalTags(tags);
    return tags;
  }, []);

  useEffect(() => {
    refreshGlobalTags().catch(() => pushToast('error', t('loadError')));
  }, [pushToast, refreshGlobalTags, t]);

  useEffect(() => {
    aiApi
      .getSettings()
      .then(setAiSettings)
      .catch(() => pushToast('error', t('loadError')));
  }, [pushToast, t]);

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

  const insertDataField = useCallback(() => {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'copyField',
        attrs: {
          label: t('fieldKindText'),
          kind: 'text',
          value: '',
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
    async (id: number) => {
      const noteName = findNoteName(workspace.tree, id);
      const confirmed = await confirmDelete({
        title: t('delete'),
        description: noteName
          ? `${t('deleteNoteTreeQuestion')} (${noteName})`
          : t('deleteNoteTreeQuestion'),
      });
      if (!confirmed) {
        return;
      }

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
    [confirmDelete, pushToast, t, workspace],
  );

  const deleteCurrentNote = useCallback(async () => {
    const confirmed = await confirmDelete({
      title: t('delete'),
      description: t('deleteQuestion'),
    });
    if (!confirmed) {
      return;
    }

    workspace
      .deleteCurrentNote()
      .then(() => {
        editor?.commands.clearContent();
        pushToast('success', t('delete'));
      })
      .catch((caught: unknown) => {
        workspace.setActionError(caught, t('deleteError'));
        pushToast('error', t('deleteError'));
      });
  }, [confirmDelete, editor, pushToast, t, workspace]);

  const deleteSelectedNotes = useCallback(async () => {
    const ids = [...workspace.selectedNoteIds];
    if (ids.length === 0) {
      return;
    }

    const confirmed = await confirmDelete({
      title: t('deleteSelected'),
      description: t('deleteNotesQuestion'),
    });
    if (!confirmed) {
      return;
    }

    workspace
      .deleteNotes(ids)
      .then(() => {
        if (workspace.selectedId === null) {
          editor?.commands.clearContent();
        }
        pushToast('success', t('delete'));
      })
      .catch((caught: unknown) => {
        workspace.setActionError(caught, t('deleteError'));
        pushToast('error', t('deleteError'));
      });
  }, [confirmDelete, editor, pushToast, t, workspace]);

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

  const updateTags = useCallback(
    (tags: string[]) => {
      if (!workspace.selectedNote) {
        return;
      }

      notesApi
        .updateTags(workspace.selectedNote.id, tags)
        .then((note) => {
          workspace.replaceSelectedNote(note);
          return workspace.refreshTree();
        })
        .then(() => pushToast('success', t('saved')))
        .catch((caught: unknown) => {
          workspace.setActionError(caught, t('saveError'));
          pushToast('error', t('saveError'));
        });
    },
    [pushToast, t, workspace],
  );

  const createGlobalTag = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        return;
      }

      try {
        await notesApi.createTag(name.trim());
        await refreshGlobalTags();
        pushToast('success', t('saved'));
      } catch (caught: unknown) {
        workspace.setActionError(caught, t('saveError'));
        pushToast('error', t('saveError'));
        throw caught;
      }
    },
    [pushToast, refreshGlobalTags, t, workspace],
  );

  const updateGlobalTag = useCallback(
    async (tag: Tag, name: string) => {
      try {
        const nextTag = await notesApi.updateTag(tag.id, name);
        setGlobalTags((current) =>
          current.some((currentTag) => currentTag.id === nextTag.id)
            ? current.filter((currentTag) => currentTag.id !== tag.id)
            : current.map((currentTag) => (currentTag.id === tag.id ? nextTag : currentTag)),
        );
        if (workspace.treeFilter.kind === 'tag' && workspace.treeFilter.tag === tag.name) {
          workspace.setTreeFilter({ kind: 'tag', tag: nextTag.name });
        }
        if (workspace.selectedNote?.tags.includes(tag.name)) {
          workspace.replaceSelectedNote({
            ...workspace.selectedNote,
            tags: workspace.selectedNote.tags.map((noteTag) =>
              noteTag === tag.name ? nextTag.name : noteTag,
            ),
          });
        }
        await workspace.refreshTree();
        pushToast('success', t('saved'));
      } catch (caught: unknown) {
        workspace.setActionError(caught, t('saveError'));
        pushToast('error', t('saveError'));
        throw caught;
      }
    },
    [pushToast, t, workspace],
  );

  const deleteGlobalTag = useCallback(
    async (tag: Tag) => {
      const confirmed = await confirmDelete({
        title: t('delete'),
        description: `${t('deleteTagQuestion')} (${tag.name})`,
      });
      if (!confirmed) {
        return;
      }

      try {
        await notesApi.deleteTag(tag.id);
        setGlobalTags((current) => current.filter((currentTag) => currentTag.id !== tag.id));
        if (workspace.treeFilter.kind === 'tag' && workspace.treeFilter.tag === tag.name) {
          workspace.setTreeFilter({ kind: 'all' });
        }
        if (workspace.selectedNote?.tags.includes(tag.name)) {
          workspace.replaceSelectedNote({
            ...workspace.selectedNote,
            tags: workspace.selectedNote.tags.filter((noteTag) => noteTag !== tag.name),
          });
        }
        await workspace.refreshTree();
        pushToast('success', t('delete'));
      } catch (caught: unknown) {
        workspace.setActionError(caught, t('deleteError'));
        pushToast('error', t('deleteError'));
        throw caught;
      }
    },
    [confirmDelete, pushToast, t, workspace],
  );

  const toggleFavorite = useCallback(() => {
    if (!workspace.selectedNote) {
      return;
    }

    notesApi
      .updateNote(workspace.selectedNote.id, { isFavorite: !workspace.selectedNote.isFavorite })
      .then((note) => {
        workspace.replaceSelectedNote(note);
        return workspace.refreshTree();
      })
      .then(() => pushToast('success', t('saved')))
      .catch((caught: unknown) => {
        workspace.setActionError(caught, t('saveError'));
        pushToast('error', t('saveError'));
      });
  }, [pushToast, t, workspace]);

  const togglePinned = useCallback(() => {
    if (!workspace.selectedNote) {
      return;
    }

    notesApi
      .updateNote(workspace.selectedNote.id, { isPinned: !workspace.selectedNote.isPinned })
      .then((note) => {
        workspace.replaceSelectedNote(note);
        return workspace.refreshTree();
      })
      .then(() => pushToast('success', t('saved')))
      .catch((caught: unknown) => {
        workspace.setActionError(caught, t('saveError'));
        pushToast('error', t('saveError'));
      });
  }, [pushToast, t, workspace]);

  const exportJsonFile = useCallback(() => {
    workspaceApi
      .exportJson()
      .then((payload) => downloadJsonFile(payload))
      .then(() => pushToast('success', t('download')))
      .catch(() => pushToast('error', t('saveError')));
  }, [pushToast, t]);

  const importJsonFile = useCallback(
    (file: File) => {
      file
        .text()
        .then((content) => validateJsonExportPayload(JSON.parse(content)))
        .then((payload) => workspaceApi.importJson(payload))
        .then(() => Promise.all([workspace.refreshTree(), refreshGlobalTags()]))
        .then(() => pushToast('success', t('saved')))
        .catch(() => pushToast('error', t('saveError')));
    },
    [pushToast, refreshGlobalTags, t, workspace],
  );

  const openTrashModal = useCallback(() => {
    setActiveModal({ type: 'trash' });
  }, []);

  const toggleAi = useCallback(() => {
    const enabled = !(aiSettings?.enabled ?? false);
    aiApi
      .updateSettings({ enabled })
      .then((settings) => {
        setAiSettings(settings);
        pushToast('success', enabled ? t('aiEnabled') : t('aiDisabled'));
        if (enabled && (!settings.hasApiKey || !settings.model)) {
          setIsAiSettingsOpen(true);
        }
      })
      .catch(() => pushToast('error', t('aiSaveError')));
  }, [aiSettings?.enabled, pushToast, t]);

  const openAiChat = useCallback(() => {
    if (!aiSettings?.enabled) {
      setIsAiSettingsOpen(true);
      return;
    }

    setIsAiSettingsOpen(false);
    setAiChatOpenSignal((value) => value + 1);
  }, [aiSettings?.enabled]);

  useEffect(() => {
    const openPalette = (event: KeyboardEvent) => {
      const primary = event.ctrlKey || event.metaKey;
      if (primary && event.shiftKey && event.code === 'KeyP') {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', openPalette);
    return () => window.removeEventListener('keydown', openPalette);
  }, []);

  const shortcutItems = useShortcutItems(t);
  useAppShortcuts({
    activeModal: Boolean(activeModal),
    createDefaultNote,
    editor,
    formatEditorCode,
    insertDataField,
    isAuthenticated: true,
    isEditorEditing,
    language,
    openLinkModal,
    openTemplatesModal: () => setActiveModal({ type: 'templates' }),
    saveEditorContent,
    selectedId: workspace.selectedId,
    setMobileTreeOpen: workspace.setMobileTreeOpen,
    theme,
    toggleCodeBlock,
    updateLanguage: onLanguageChange,
    updateTheme: onThemeChange,
  });

  const commandPaletteItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: 'ai-chat',
        label: t('commandAiChat'),
        description: t('commandAiChatDesc'),
        shortcut: 'Ctrl Shift P',
        icon: <Bot size={15} />,
        run: openAiChat,
      },
      {
        id: 'ai-settings',
        label: t('commandAiSettings'),
        description: t('commandAiSettingsDesc'),
        icon: <Settings size={15} />,
        run: () => setIsAiSettingsOpen(true),
      },
      {
        id: 'new-note',
        label: t('shortcutNewFocused'),
        description: t('commandNewNoteDesc'),
        shortcut: 'Ctrl Alt N',
        icon: <FilePlus2 size={15} />,
        run: () => createDefaultNote(workspace.selectedId),
      },
      {
        id: 'save-note',
        label: t('shortcutSave'),
        description: t('commandSaveNoteDesc'),
        shortcut: 'Ctrl S',
        icon: <Save size={15} />,
        disabled: !workspace.selectedNote || !isEditorEditing,
        run: () => void saveEditorContent(),
      },
      {
        id: 'focus-search',
        label: t('shortcutSearch'),
        description: t('commandSearchDesc'),
        shortcut: 'Ctrl /',
        icon: <Search size={15} />,
        run: () => {
          workspace.setMobileTreeOpen(true);
          window.setTimeout(
            () => document.querySelector<HTMLInputElement>('.search-box input')?.focus(),
            0,
          );
        },
      },
      {
        id: 'templates',
        label: t('templates'),
        description: t('commandTemplatesDesc'),
        shortcut: 'Ctrl P',
        icon: <Tags size={15} />,
        run: () => setActiveModal({ type: 'templates' }),
      },
      {
        id: 'trash',
        label: t('trash'),
        description: t('commandTrashDesc'),
        icon: <Trash2 size={15} />,
        run: () => setActiveModal({ type: 'trash' }),
      },
      {
        id: 'share',
        label: t('shareLinks'),
        description: t('commandShareDesc'),
        icon: <Link2 size={15} />,
        disabled: !workspace.selectedNote,
        run: () => setActiveModal({ type: 'share' }),
      },
      {
        id: 'files',
        label: t('accountFiles'),
        description: t('commandFilesDesc'),
        icon: <Files size={15} />,
        run: () => setActiveModal({ type: 'accountAttachments' }),
      },
      {
        id: 'theme',
        label: t('shortcutTheme'),
        description: t('commandThemeDesc'),
        shortcut: 'Ctrl Alt T',
        icon: <Palette size={15} />,
        run: () => onThemeChange(getNextTheme(theme)),
      },
      {
        id: 'language',
        label: t('shortcutLanguage'),
        description: t('commandLanguageDesc'),
        shortcut: 'Ctrl Alt G',
        icon: <Languages size={15} />,
        run: () => onLanguageChange(language === 'ru' ? 'en' : 'ru'),
      },
      {
        id: 'sidebar',
        label: t('shortcutSidebar'),
        description: t('commandSidebarDesc'),
        shortcut: 'Ctrl \\',
        icon: <PanelLeft size={15} />,
        run: () => workspace.setMobileTreeOpen((isOpen) => !isOpen),
      },
      {
        id: 'admin',
        label: t('adminPanel'),
        description: t('commandAdminDesc'),
        icon: <ShieldCheck size={15} />,
        disabled: user.role !== 'admin',
        run: () => navigate('/admin'),
      },
    ],
    [
      createDefaultNote,
      isEditorEditing,
      language,
      navigate,
      onLanguageChange,
      onThemeChange,
      openAiChat,
      saveEditorContent,
      t,
      theme,
      user.role,
      workspace,
    ],
  );

  return (
    <main className="app-shell">
      <a className="skip-link" href="#app-main">
        {t('skipToContent')}
      </a>
      <Sidebar
        tree={workspace.visibleTree}
        pinnedNodes={workspace.pinnedNodes}
        query={workspace.query}
        treeFilter={workspace.treeFilter}
        tags={globalTagNames}
        favoriteCount={workspace.favoriteCount}
        totalNotes={workspace.totalNotes}
        selectedId={workspace.selectedId}
        selectedNoteIds={workspace.selectedNoteIds}
        expanded={workspace.expanded}
        draggedId={workspace.draggedId}
        status={workspace.status}
        isOpen={workspace.mobileTreeOpen}
        language={language}
        theme={theme}
        t={t}
        isAdmin={user.role === 'admin'}
        onClose={() => workspace.setMobileTreeOpen(false)}
        onQueryChange={workspace.setQuery}
        onFilterChange={workspace.setTreeFilter}
        onCreateNote={() => createDefaultNote(workspace.selectedId)}
        onSelectRoot={workspace.selectRoot}
        onDropRoot={() => dropDraggedNote(null)}
        onToggleNode={workspace.toggleExpanded}
        onSelectNoteItem={(id, flatOrder, event) => {
          workspace.selectNoteItem(id, flatOrder, event);
        }}
        onRenameNode={renameTreeNote}
        onDeleteNode={deleteTreeNote}
        onDeleteSelectedNotes={() => void deleteSelectedNotes()}
        onDragStart={workspace.setDraggedId}
        onDropNode={dropDraggedNote}
        onLanguageToggle={() => onLanguageChange(language === 'ru' ? 'en' : 'ru')}
        onThemeChange={onThemeChange}
        onExportJson={exportJsonFile}
        onImportJson={importJsonFile}
        onOpenTrash={openTrashModal}
        onOpenGlobalAttachments={() => setActiveModal({ type: 'accountAttachments' })}
        aiEnabled={
          Boolean(user.subscription?.entitlements.ai.enabled) && Boolean(aiSettings?.enabled)
        }
        onAiToggle={toggleAi}
        onLogout={onLogout}
      />

      <section className="workspace" id="app-main">
        {user.role !== 'admin' && user.subscription && !user.subscription.entitlements.ai.enabled ? (
          <div className="workspace__banners">
            <div className="subscription-banner subscription-banner--warn" role="status">
              <span>{t('subscriptionAiLocked')}</span>
              <Link to="/account">{t('subscriptionUpgrade')}</Link>
            </div>
          </div>
        ) : null}
        {user.role !== 'admin' &&
        user.subscription &&
        user.subscription.entitlements.files.enabled &&
        user.subscription.entitlements.files.storageLimitBytes != null &&
        user.subscription.storageUsedBytes >=
          user.subscription.entitlements.files.storageLimitBytes * 0.9 ? (
          <div className="workspace__banners">
            <div className="subscription-banner subscription-banner--warn" role="status">
              <span>{t('subscriptionStorageBanner')}</span>
              <Link to="/account">{t('subscriptionUpgrade')}</Link>
            </div>
          </div>
        ) : null}
        <div className="workspace__main">
          <Topbar
              selectedNote={workspace.selectedNote}
              draft={workspace.draft}
              tags={globalTags}
              t={t}
              language={language}
              isEditing={isEditorEditing}
              onOpenSidebar={() => workspace.setMobileTreeOpen((isOpen) => !isOpen)}
              onDraftNameChange={workspace.updateDraftName}
              onSave={() => void saveEditorContent()}
              onDelete={() => void deleteCurrentNote()}
              onToggleFavorite={toggleFavorite}
              onTogglePinned={togglePinned}
              onTagsChange={updateTags}
              onCreateTag={createGlobalTag}
              onUpdateTag={updateGlobalTag}
              onDeleteTag={deleteGlobalTag}
            />

            <RichTextToolbar
              editor={editor}
              t={t}
              isEditing={isEditorEditing}
              hasSelectedNote={Boolean(workspace.selectedNote)}
              shortcuts={shortcutItems}
              onModeChange={setIsEditorEditing}
              onOpenLink={openLinkModal}
              onInsertDataField={insertDataField}
              onOpenVersions={() => setActiveModal({ type: 'versions' })}
              onOpenTemplates={() => setActiveModal({ type: 'templates' })}
              onOpenShareLinks={() => setActiveModal({ type: 'share' })}
              onOpenAttachments={() => setActiveModal({ type: 'attachments' })}
            />

            <section
              className={`editor-wrap ${isEditorEditing ? 'editor-wrap--edit' : 'editor-wrap--preview'}`}
              ref={editorWrapRef}
            >
              {workspace.selectedNote ? (
                <EditorContent editor={editor} />
              ) : (
                <EmptyState
                  className="empty-editor"
                  title={t('emptyEditor')}
                  hint={t('emptyEditorHint')}
                  actionLabel={t('createNote')}
                  onAction={() => createDefaultNote(null)}
                />
              )}
            </section>
            <EditorLinkTooltip containerRef={editorWrapRef} isEditing={isEditorEditing} />
        </div>
      </section>

      <AiAssistant
        settings={aiSettings}
        t={t}
        language={language}
        isSettingsOpen={isAiSettingsOpen}
        openChatSignal={aiChatOpenSignal}
        onSettingsOpenChange={setIsAiSettingsOpen}
        onSettingsChange={setAiSettings}
        currentNote={
          workspace.selectedNote
            ? {
                id: workspace.selectedNote.id,
                name: workspace.draft.name || workspace.selectedNote.name,
                contentHtml: workspace.draft.contentHtml,
                contentText: workspace.draft.contentText,
              }
            : null
        }
        onActionApplied={async (noteId, actionName) => {
          const [nodes] = await Promise.all([workspace.refreshTree(), refreshGlobalTags()]);

          if (actionName === 'notes.delete') {
            if (workspace.reconcileSelection(nodes) === null) {
              editor?.commands.clearContent();
            }
            return;
          }

          if (!noteId) {
            workspace.reconcileSelection(nodes);
            return;
          }

          workspace.selectNote(noteId);
          await workspace.loadNote(noteId);
        }}
        pushToast={pushToast}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        t={t}
        commands={commandPaletteItems}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      <Modal
        isOpen={activeModal?.type === 'trash'}
        title={t('trash')}
        closeLabel={t('close')}
        onClose={() => setActiveModal(null)}
      >
        <TrashPanel
          selectedNote={workspace.selectedNote}
          selectedId={workspace.selectedId}
          draft={workspace.draft}
          t={t}
          onSelectNote={(id) => {
            workspace.selectNote(id);
            setActiveModal(null);
          }}
          onRefreshTree={workspace.refreshTree}
          onReloadNote={workspace.loadNote}
          onSuccess={(message) => pushToast('success', message)}
          onError={(message) => pushToast('error', message)}
        />
      </Modal>

      <Modal
        isOpen={activeModal?.type === 'versions'}
        title={t('versions')}
        closeLabel={t('close')}
        onClose={() => setActiveModal(null)}
      >
        <VersionsPanel
          selectedNote={workspace.selectedNote}
          selectedId={workspace.selectedId}
          draft={workspace.draft}
          t={t}
          onSelectNote={workspace.selectNote}
          onRefreshTree={workspace.refreshTree}
          onReloadNote={workspace.loadNote}
          onSuccess={(message) => pushToast('success', message)}
          onError={(message) => pushToast('error', message)}
        />
      </Modal>

      <Modal
        isOpen={activeModal?.type === 'templates'}
        title={t('templates')}
        closeLabel={t('close')}
        onClose={() => setActiveModal(null)}
      >
        <TemplatesPanel
          selectedNote={workspace.selectedNote}
          selectedId={workspace.selectedId}
          draft={workspace.draft}
          t={t}
          onSelectNote={(id) => {
            workspace.selectNote(id);
            setActiveModal(null);
          }}
          onRefreshTree={workspace.refreshTree}
          onReloadNote={workspace.loadNote}
          onSuccess={(message) => pushToast('success', message)}
          onError={(message) => pushToast('error', message)}
        />
      </Modal>

      <Modal
        isOpen={activeModal?.type === 'share'}
        title={t('shareLinks')}
        closeLabel={t('close')}
        onClose={() => setActiveModal(null)}
      >
        <ShareLinksPanel
          selectedNote={workspace.selectedNote}
          selectedId={workspace.selectedId}
          draft={workspace.draft}
          t={t}
          onSelectNote={workspace.selectNote}
          onRefreshTree={workspace.refreshTree}
          onReloadNote={workspace.loadNote}
          onSuccess={(message) => pushToast('success', message)}
          onError={(message) => pushToast('error', message)}
        />
      </Modal>

      <Modal
        isOpen={activeModal?.type === 'attachments'}
        title={t('attachments')}
        closeLabel={t('close')}
        panelClassName="modal-panel--attachments"
        onClose={() => setActiveModal(null)}
      >
        <AttachmentsPanel
          selectedNote={workspace.selectedNote}
          selectedId={workspace.selectedId}
          draft={workspace.draft}
          t={t}
          onSelectNote={workspace.selectNote}
          onRefreshTree={workspace.refreshTree}
          onReloadNote={workspace.loadNote}
          onSuccess={(message) => pushToast('success', message)}
          onError={(message) => pushToast('error', message)}
        />
      </Modal>

      <Modal
        isOpen={activeModal?.type === 'accountAttachments'}
        title={t('accountFiles')}
        closeLabel={t('close')}
        panelClassName="modal-panel--attachments"
        onClose={() => setActiveModal(null)}
      >
        <AttachmentsPanel
          scope="account"
          notesTree={workspace.tree}
          selectedNote={workspace.selectedNote}
          selectedId={workspace.selectedId}
          draft={workspace.draft}
          t={t}
          onSelectNote={workspace.selectNote}
          onRefreshTree={workspace.refreshTree}
          onReloadNote={workspace.loadNote}
          onSuccess={(message) => pushToast('success', message)}
          onError={(message) => pushToast('error', message)}
        />
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
            autoComplete="url"
            autoFocus
          />
          <input
            value={linkText}
            onChange={(event) => setLinkText(event.target.value)}
            placeholder={t('linkText')}
            autoComplete="off"
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
