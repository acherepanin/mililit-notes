import {
  ArchiveRestore,
  Copy,
  FilePlus2,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { notesApi, workspaceApi } from '../../api';
import { useConfirmDelete } from '../../components/DeleteConfirmationProvider';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { Note, NoteDraft, NoteTemplate, NoteVersion, ShareLink } from '../../types';

interface PanelProps {
  t: Translator;
  selectedNote: Note | null;
  selectedId: number | null;
  draft: NoteDraft;
  onSelectNote: (id: number) => void;
  onRefreshTree: () => Promise<unknown>;
  onReloadNote: (id: number) => Promise<unknown>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

async function runTool(
  action: () => Promise<unknown>,
  onSuccess: (message: string) => void,
  onError: (message: string) => void,
  successMessage: string,
  errorMessage: string,
) {
  try {
    await action();
    onSuccess(successMessage);
  } catch {
    onError(errorMessage);
  }
}

function getShareUrl(link: ShareLink): string {
  return link.url ? `${window.location.origin}${link.url}` : '';
}

export function TrashPanel({ t, onSelectNote, onRefreshTree, onSuccess, onError }: PanelProps) {
  const confirmDelete = useConfirmDelete();
  const [trash, setTrash] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTrash = normalizedQuery
    ? trash.filter((note) => note.name.toLowerCase().includes(normalizedQuery))
    : trash;

  const refresh = async () => setTrash(await notesApi.listTrash());

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="note-tool-panel">
      <div className="note-tool-panel__head">
        <IconButton
          label={t('refresh')}
          icon={<RefreshCw size={16} />}
          onClick={() => runTool(refresh, onSuccess, onError, t('ready'), t('loadError'))}
        />
      </div>
      <label className="search-box note-tool-search">
        <Search size={15} />
        <input
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
        />
      </label>
      <div className="trash-list">
        {filteredTrash.map((note) => (
          <article className="trash-row" key={note.id}>
            <div className="trash-row__content">
              <TooltipText value={note.name} className="trash-row__title" />
            </div>
            <div className="trash-row__actions">
              <IconButton
                className="trash-row__button"
                label={t('restore')}
                icon={<ArchiveRestore size={16} />}
                onClick={() =>
                  runTool(
                    async () => {
                      const restored = await notesApi.restoreNote(note.id);
                      await refresh();
                      await onRefreshTree();
                      onSelectNote(restored.id);
                    },
                    onSuccess,
                    onError,
                    t('restore'),
                    t('saveError'),
                  )
                }
              />
              <IconButton
                className="trash-row__button"
                label={t('deleteForever')}
                icon={<Trash2 size={16} />}
                variant="danger"
                onClick={() =>
                  runTool(
                    async () => {
                      const confirmed = await confirmDelete({
                        title: t('deleteForever'),
                        description: `${t('deleteForeverQuestion')} (${note.name})`,
                      });
                      if (!confirmed) {
                        return;
                      }
                      await notesApi.permanentDeleteNote(note.id);
                      await refresh();
                      await onRefreshTree();
                    },
                    onSuccess,
                    onError,
                    t('delete'),
                    t('deleteError'),
                  )
                }
              />
            </div>
          </article>
        ))}
        {filteredTrash.length === 0 ? (
          <EmptyState
            tone="panel"
            title={trash.length === 0 ? t('emptyTrashTitle') : t('emptyTrashSearchTitle')}
            hint={trash.length === 0 ? t('emptyTrashHint') : t('emptyTrashSearchHint')}
          />
        ) : null}
      </div>
    </div>
  );
}

export function VersionsPanel({
  t,
  selectedNote,
  onRefreshTree,
  onReloadNote,
  onSuccess,
  onError,
}: PanelProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const selectedNoteId = selectedNote?.id ?? null;

  const refresh = useCallback(async () => {
    if (!selectedNoteId) {
      setVersions([]);
      return;
    }
    setVersions(await notesApi.listVersions(selectedNoteId));
  }, [selectedNoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="note-tool-panel">
      <div className="note-tool-panel__head">
        <IconButton
          label={t('refresh')}
          icon={<RefreshCw size={16} />}
          disabled={!selectedNote}
          onClick={() => runTool(refresh, onSuccess, onError, t('ready'), t('loadError'))}
        />
      </div>
      <div className="versions-list">
        {versions.map((version) => (
          <article className="version-row" key={version.id}>
            <div className="version-row__content">
              <TooltipText value={version.name} className="version-row__title" />
              <time className="version-row__date" dateTime={version.createdAt}>
                {new Date(version.createdAt).toLocaleString()}
              </time>
            </div>
            <div className="version-row__action">
              <IconButton
                label={t('restoreVersion')}
                className="version-row__button"
                icon={<RotateCcw size={16} />}
                onClick={() =>
                  runTool(
                    async () => {
                      await notesApi.restoreVersion(version.noteId, version.id);
                      await onReloadNote(version.noteId);
                      await onRefreshTree();
                      await refresh();
                    },
                    onSuccess,
                    onError,
                    t('restoreVersion'),
                    t('saveError'),
                  )
                }
              />
            </div>
          </article>
        ))}
        {versions.length === 0 ? (
          <EmptyState
            tone="panel"
            title={selectedNote ? t('emptyVersionsTitle') : t('emptyVersionsNoNoteTitle')}
            hint={selectedNote ? t('emptyVersionsHint') : t('emptyVersionsNoNoteHint')}
          />
        ) : null}
      </div>
    </div>
  );
}

export function TemplatesPanel({
  t,
  selectedNote,
  selectedId,
  draft,
  onSelectNote,
  onRefreshTree,
  onSuccess,
  onError,
}: PanelProps) {
  const confirmDelete = useConfirmDelete();
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);

  const refresh = async () => setTemplates(await workspaceApi.listTemplates());

  const saveAsTemplate = () =>
    runTool(
      async () => {
        await workspaceApi.createTemplate({
          name: draft.name || t('defaultNoteName'),
          contentHtml: draft.contentHtml,
          contentText: draft.contentText,
        });
        await refresh();
      },
      onSuccess,
      onError,
      t('saved'),
      t('saveError'),
    );

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="note-tool-panel">
      <div className="note-tool-panel__head">
        <IconButton
          label={t('refresh')}
          icon={<RefreshCw size={16} />}
          onClick={() => runTool(refresh, onSuccess, onError, t('ready'), t('loadError'))}
        />
        <IconButton
          label={t('saveAsTemplate')}
          icon={<FilePlus2 size={16} />}
          variant="primary"
          disabled={!selectedNote}
          onClick={saveAsTemplate}
        />
      </div>
      <div className="note-tool-list">
        {templates.map((template) => (
          <article className="note-tool-item" key={template.id}>
            <TooltipText value={template.name} className="note-tool-item__title" />
            <div className="note-tool-item__actions">
              <IconButton
                label={t('createFromTemplate')}
                icon={<Plus size={16} />}
                onClick={() =>
                  runTool(
                    async () => {
                      const note = await workspaceApi.createNoteFromTemplate(
                        template.id,
                        selectedId,
                      );
                      await onRefreshTree();
                      onSelectNote(note.id);
                    },
                    onSuccess,
                    onError,
                    t('create'),
                    t('createError'),
                  )
                }
              />
              {!template.isSystem ? (
                <IconButton
                  label={t('delete')}
                  icon={<Trash2 size={16} />}
                  variant="danger"
                  onClick={() =>
                    runTool(
                      async () => {
                        const confirmed = await confirmDelete({
                          title: t('delete'),
                          description: `${t('deleteTemplateQuestion')} (${template.name})`,
                        });
                        if (!confirmed) {
                          return;
                        }
                        await workspaceApi.deleteTemplate(template.id);
                        await refresh();
                      },
                      onSuccess,
                      onError,
                      t('delete'),
                      t('deleteError'),
                    )
                  }
                />
              ) : null}
            </div>
          </article>
        ))}
        {templates.length === 0 ? (
          <EmptyState
            tone="panel"
            title={t('emptyTemplatesTitle')}
            hint={t('emptyTemplatesHint')}
            actionLabel={t('saveAsTemplate')}
            onAction={saveAsTemplate}
            actionDisabled={!selectedNote}
          />
        ) : null}
      </div>
    </div>
  );
}

export function ShareLinksPanel({ t, selectedNote, onSuccess, onError }: PanelProps) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [includeSecrets, setIncludeSecrets] = useState(true);
  const [oneTime, setOneTime] = useState(false);
  const selectedNoteId = selectedNote?.id ?? null;

  const refresh = useCallback(async () => {
    if (!selectedNoteId) {
      setShareLinks([]);
      return;
    }
    setShareLinks(await workspaceApi.listShareLinks(selectedNoteId));
  }, [selectedNoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createShareLink = () =>
    runTool(
      async () => {
        if (!selectedNote) {
          return;
        }
        const link = await workspaceApi.createShareLink(selectedNote.id, {
          ttlHours: 24,
          includeSecrets,
          oneTime,
        });
        await navigator.clipboard.writeText(`${window.location.origin}${link.url}`);
        await refresh();
      },
      onSuccess,
      onError,
      t('copied'),
      t('saveError'),
    );

  return (
    <div className="note-tool-panel">
      <div className="note-tool-panel__head">
        <IconButton
          label={t('refresh')}
          icon={<RefreshCw size={16} />}
          disabled={!selectedNote}
          onClick={() => runTool(refresh, onSuccess, onError, t('ready'), t('loadError'))}
        />
        <IconButton
          label={t('includeSecrets')}
          icon={includeSecrets ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
          variant={includeSecrets ? 'active' : 'plain'}
          onClick={() => setIncludeSecrets((current) => !current)}
        />
        <IconButton
          label={t('oneTimeShareLink')}
          icon={<MousePointerClick size={16} />}
          variant={oneTime ? 'active' : 'plain'}
          onClick={() => setOneTime((current) => !current)}
        />
        <IconButton
          label={t('createShareLink')}
          icon={<Share2 size={16} />}
          variant="primary"
          disabled={!selectedNote}
          onClick={createShareLink}
        />
      </div>
      <div className="note-tool-list">
        {shareLinks.map((link) => {
          const shareUrl = getShareUrl(link);

          return (
            <article className="note-tool-item note-tool-item--share" key={link.id}>
              <div className="note-tool-item__main">
                <span>{new Date(link.expiresAt).toLocaleString()}</span>
                {link.oneTime ? <small>{t('oneTimeShareLink')}</small> : null}
                {shareUrl ? (
                  <a className="note-tool-link" href={shareUrl} target="_blank" rel="noreferrer">
                    <TooltipText value={shareUrl} className="note-tool-item__title" />
                  </a>
                ) : (
                  <TooltipText
                    value={link.revokedAt ? t('revoke') : link.lastAccessedAt || t('ready')}
                    className="note-tool-item__title"
                  />
                )}
              </div>
              <div className="note-tool-item__actions">
                {!link.revokedAt ? (
                  <IconButton
                    label={t('copy')}
                    icon={<Copy size={16} />}
                    disabled={!shareUrl}
                    onClick={() =>
                      runTool(
                        async () => navigator.clipboard.writeText(shareUrl),
                        onSuccess,
                        onError,
                        t('copied'),
                        t('saveError'),
                      )
                    }
                  />
                ) : null}
                <IconButton
                  label={t('revoke')}
                  icon={<Trash2 size={16} />}
                  variant="danger"
                  onClick={() =>
                    runTool(
                      async () => {
                        await workspaceApi.revokeShareLink(link.id);
                        await refresh();
                      },
                      onSuccess,
                      onError,
                      t('revoke'),
                      t('saveError'),
                    )
                  }
                />
              </div>
            </article>
          );
        })}
        {shareLinks.length === 0 ? (
          <EmptyState
            tone="panel"
            title={selectedNote ? t('emptyShareTitle') : t('emptyShareNoNoteTitle')}
            hint={selectedNote ? t('emptyShareHint') : t('emptyShareNoNoteHint')}
            actionLabel={t('createShareLink')}
            onAction={createShareLink}
            actionDisabled={!selectedNote}
          />
        ) : null}
      </div>
    </div>
  );
}

export { AttachmentsPanel } from './AttachmentsPanel';
