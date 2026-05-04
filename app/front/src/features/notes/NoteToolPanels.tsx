import {
  ArchiveRestore,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FilePlus2,
  Link2,
  MoreVertical,
  NotebookText,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import { notesApi, workspaceApi } from '../../api';
import { CustomSelect, type SelectOption } from '../../components/CustomSelect';
import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type {
  Attachment,
  Note,
  NoteDraft,
  NoteTemplate,
  NoteTreeNode,
  NoteVersion,
  ShareLink,
} from '../../types';
import {
  ATTACHMENT_MENU_HEIGHT,
  ATTACHMENT_MENU_WIDTH,
  type AttachmentActionMenu,
  type AttachmentPreview,
  PREVIEW_MARGIN,
  type PreviewFrame,
  type PreviewInteraction,
  type ResizeEdge,
  clampPreviewFrame,
  fileToBase64,
  formatFileSize,
  getAttachmentIcon,
  getFileExtension,
  getPreviewKind,
  saveBlob,
} from './attachmentsPanel.helpers';

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

function flattenNoteOptions(nodes: NoteTreeNode[]): Array<SelectOption<string>> {
  const options: Array<SelectOption<string>> = [{ value: 'none', label: '-' }];
  const walk = (items: NoteTreeNode[], level = 0) => {
    for (const item of items) {
      options.push({ value: String(item.id), label: `${'  '.repeat(level)}${item.name}` });
      walk(item.children, level + 1);
    }
  };

  walk(nodes);
  return options;
}

export function TrashPanel({ t, onSelectNote, onRefreshTree, onSuccess, onError }: PanelProps) {
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
          <div className="note-tool-empty">{t('emptyTree')}</div>
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
        {versions.length === 0 ? <div className="note-tool-empty">{t('emptyTree')}</div> : null}
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
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);

  const refresh = async () => setTemplates(await workspaceApi.listTemplates());

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
          onClick={() =>
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
            )
          }
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
        {templates.length === 0 ? <div className="note-tool-empty">{t('emptyTree')}</div> : null}
      </div>
    </div>
  );
}

export function ShareLinksPanel({ t, selectedNote, onSuccess, onError }: PanelProps) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [includeSecrets, setIncludeSecrets] = useState(true);
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
          label={t('createShareLink')}
          icon={<Share2 size={16} />}
          variant="primary"
          disabled={!selectedNote}
          onClick={() =>
            runTool(
              async () => {
                if (!selectedNote) return;
                const link = await workspaceApi.createShareLink(selectedNote.id, {
                  ttlHours: 24,
                  includeSecrets,
                });
                await navigator.clipboard.writeText(`${window.location.origin}${link.url}`);
                await refresh();
              },
              onSuccess,
              onError,
              t('copied'),
              t('saveError'),
            )
          }
        />
      </div>
      <div className="note-tool-list">
        {shareLinks.map((link) => {
          const shareUrl = getShareUrl(link);

          return (
            <article className="note-tool-item note-tool-item--share" key={link.id}>
              <div className="note-tool-item__main">
                <span>{new Date(link.expiresAt).toLocaleString()}</span>
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
        {shareLinks.length === 0 ? <div className="note-tool-empty">{t('emptyTree')}</div> : null}
      </div>
    </div>
  );
}

interface AttachmentsPanelProps extends PanelProps {
  scope?: 'note' | 'account';
  notesTree?: NoteTreeNode[];
}

export function AttachmentsPanel({
  t,
  selectedNote,
  onSuccess,
  onError,
  scope = 'note',
  notesTree = [],
}: AttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [actionMenu, setActionMenu] = useState<AttachmentActionMenu | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [previewFrame, setPreviewFrame] = useState<PreviewFrame | null>(null);
  const isAccountScope = scope === 'account';
  const selectedNoteId = selectedNote?.id ?? null;
  const canUpload = isAccountScope || Boolean(selectedNoteId);
  const noteOptions = useMemo(() => flattenNoteOptions(notesTree), [notesTree]);
  const managerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRenameRef = useRef(false);
  const previewInteractionRef = useRef<PreviewInteraction | null>(null);

  const refresh = useCallback(async () => {
    if (isAccountScope) {
      setAttachments(await workspaceApi.listAccountAttachments());
      return;
    }

    if (!selectedNoteId) {
      setAttachments([]);
      return;
    }
    setAttachments(await workspaceApi.listAttachments(selectedNoteId));
  }, [isAccountScope, selectedNoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
    setActionMenu(null);
    setPreviewFrame(null);
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }, [scope, selectedNoteId]);

  useEffect(() => {
    let isCancelled = false;
    const urls: Record<number, string> = {};
    setThumbnailUrls({});

    async function loadThumbnails() {
      const imageAttachments = attachments.filter(
        (attachment) => getPreviewKind(attachment) === 'image',
      );
      await Promise.all(
        imageAttachments.map(async (attachment) => {
          try {
            const blob = await workspaceApi.downloadAttachment(attachment.id);
            if (!isCancelled) {
              urls[attachment.id] = URL.createObjectURL(blob);
            }
          } catch {
            // A missing thumbnail must not block the file manager.
          }
        }),
      );
      if (!isCancelled) {
        setThumbnailUrls(urls);
      }
    }

    void loadThumbnails();
    return () => {
      isCancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments]);

  useEffect(
    () => () => {
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
    },
    [preview],
  );

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const interaction = previewInteractionRef.current;
      if (!interaction) {
        return;
      }

      const bounds = managerRef.current?.getBoundingClientRect();
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;

      if (interaction.type === 'move') {
        setPreviewFrame(
          clampPreviewFrame(
            {
              ...interaction.frame,
              x: interaction.frame.x + dx,
              y: interaction.frame.y + dy,
            },
            bounds,
          ),
        );
        return;
      }

      const nextFrame = { ...interaction.frame };
      if (interaction.edge.includes('e')) {
        nextFrame.width = interaction.frame.width + dx;
      }
      if (interaction.edge.includes('s')) {
        nextFrame.height = interaction.frame.height + dy;
      }
      if (interaction.edge.includes('w')) {
        nextFrame.x = interaction.frame.x + dx;
        nextFrame.width = interaction.frame.width - dx;
      }
      if (interaction.edge.includes('n')) {
        nextFrame.y = interaction.frame.y + dy;
        nextFrame.height = interaction.frame.height - dy;
      }
      setPreviewFrame(clampPreviewFrame(nextFrame, bounds));
    };

    const onPointerUp = () => {
      previewInteractionRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAttachments = useMemo(
    () =>
      normalizedQuery
        ? attachments.filter((attachment) => {
            const extension = getFileExtension(attachment.fileName);
            const name = attachment.fileName.toLowerCase();
            const noteName = attachment.noteName?.toLowerCase() ?? '';
            return (
              name.includes(normalizedQuery) ||
              extension.includes(normalizedQuery) ||
              noteName.includes(normalizedQuery)
            );
          })
        : attachments,
    [attachments, normalizedQuery],
  );
  const selectedAttachmentIds = useMemo(
    () =>
      filteredAttachments
        .filter((attachment) => selectedIds.has(attachment.id))
        .map((attachment) => attachment.id),
    [filteredAttachments, selectedIds],
  );

  const uploadFiles = async (files: File[]) => {
    if (!canUpload) {
      return;
    }

    for (const file of files) {
      await workspaceApi.uploadAttachment({
        noteId: isAccountScope ? null : selectedNoteId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      });
    }
    await refresh();
  };

  const downloadFile = async (attachment: Attachment) => {
    const blob = await workspaceApi.downloadAttachment(attachment.id);
    saveBlob(blob, attachment.fileName);
  };

  const downloadArchive = async () => {
    const ids = selectedAttachmentIds.length ? selectedAttachmentIds : [];
    if (isAccountScope) {
      const blob = await workspaceApi.downloadAccountAttachmentsArchive(ids);
      saveBlob(blob, 'account-attachments.zip');
      return;
    }

    if (!selectedNoteId) {
      return;
    }

    const blob = await workspaceApi.downloadAttachmentsArchive(selectedNoteId, ids);
    saveBlob(blob, `${selectedNote?.name ?? 'note'}-attachments.zip`);
  };

  const attachToNote = async (attachment: Attachment, value: string) => {
    await workspaceApi.attachAttachmentToNote(
      attachment.id,
      value === 'none' ? null : Number(value),
    );
    await refresh();
  };

  const deleteAttachments = async (ids: number[]) => {
    for (const id of ids) {
      await workspaceApi.deleteAttachment(id);
    }
    setSelectedIds(new Set());
    await refresh();
  };

  const openPreview = async (attachment: Attachment) => {
    const kind = getPreviewKind(attachment);
    const blob = await workspaceApi.downloadAttachment(attachment.id);
    const url = URL.createObjectURL(blob);
    const nextPreview: AttachmentPreview = {
      attachment,
      kind,
      url,
      text: kind === 'text' ? await blob.text() : undefined,
    };

    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return nextPreview;
    });

    const bounds = managerRef.current?.getBoundingClientRect();
    if (bounds) {
      const width = Math.min(Math.max(bounds.width * 0.42, 380), bounds.width - 24);
      const height = Math.min(Math.max(bounds.height * 0.58, 300), bounds.height - 24);
      setPreviewFrame(
        clampPreviewFrame(
          {
            x: bounds.width - width - 12,
            y: 88,
            width,
            height,
          },
          bounds,
        ),
      );
    }
  };

  const openInBrowser = async (attachment: Attachment) => {
    const blob = await workspaceApi.downloadAttachment(attachment.id);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const selectAttachment = (attachment: Attachment, event: MouseEvent<HTMLElement>) => {
    const visibleIds = filteredAttachments.map((item) => item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (event.shiftKey && lastSelectedId) {
        const start = visibleIds.indexOf(lastSelectedId);
        const end = visibleIds.indexOf(attachment.id);
        if (start >= 0 && end >= 0) {
          const [from, to] = start < end ? [start, end] : [end, start];
          visibleIds.slice(from, to + 1).forEach((id) => next.add(id));
        }
      } else if (event.ctrlKey || event.metaKey) {
        if (next.has(attachment.id)) {
          next.delete(attachment.id);
        } else {
          next.add(attachment.id);
        }
      } else {
        next.clear();
        next.add(attachment.id);
      }
      return next;
    });
    setLastSelectedId(attachment.id);
    setActionMenu(null);
  };

  const beginRename = (attachment: Attachment) => {
    cancelRenameRef.current = false;
    setEditingId(attachment.id);
    setEditingName(attachment.fileName);
  };

  const commitRename = async (attachment: Attachment) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditingId(null);
      return;
    }
    const nextName = editingName.trim();
    setEditingId(null);
    if (!nextName || nextName === attachment.fileName) {
      return;
    }
    await workspaceApi.renameAttachment(attachment.id, nextName);
    await refresh();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    setActionMenu(null);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) {
      return;
    }
    void runTool(() => uploadFiles(files), onSuccess, onError, t('saved'), t('saveError'));
  };

  const startPreviewMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest(
        'button, audio, video, iframe, .attachment-preview__resize',
      )
    ) {
      return;
    }
    if (!previewFrame) {
      return;
    }
    event.preventDefault();
    previewInteractionRef.current = {
      type: 'move',
      startX: event.clientX,
      startY: event.clientY,
      frame: previewFrame,
    };
  };

  const startPreviewResize = (edge: ResizeEdge, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!previewFrame) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    previewInteractionRef.current = {
      type: 'resize',
      edge,
      startX: event.clientX,
      startY: event.clientY,
      frame: previewFrame,
    };
  };

  const openAttachmentMenu = (attachment: Attachment, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const bodyRect = bodyRef.current?.getBoundingClientRect();
    const buttonRect = event.currentTarget.getBoundingClientRect();
    if (!bodyRect) {
      setActionMenu((current) =>
        current?.id === attachment.id ? null : { id: attachment.id, x: 0, y: 0 },
      );
      return;
    }

    const rawX = buttonRect.right - bodyRect.left - ATTACHMENT_MENU_WIDTH;
    const rawY =
      buttonRect.bottom - bodyRect.top + 4 + ATTACHMENT_MENU_HEIGHT > bodyRect.height
        ? buttonRect.top - bodyRect.top - ATTACHMENT_MENU_HEIGHT - 4
        : buttonRect.bottom - bodyRect.top + 4;
    const maxX = Math.max(PREVIEW_MARGIN, bodyRect.width - ATTACHMENT_MENU_WIDTH - PREVIEW_MARGIN);
    const maxY = Math.max(
      PREVIEW_MARGIN,
      bodyRect.height - ATTACHMENT_MENU_HEIGHT - PREVIEW_MARGIN,
    );

    setActionMenu((current) =>
      current?.id === attachment.id
        ? null
        : {
            id: attachment.id,
            x: Math.min(Math.max(rawX, PREVIEW_MARGIN), maxX),
            y: Math.min(Math.max(rawY, PREVIEW_MARGIN), maxY),
          },
    );
  };

  const actionMenuAttachment = actionMenu
    ? attachments.find((attachment) => attachment.id === actionMenu.id)
    : null;

  return (
    <div
      ref={managerRef}
      className={`attachments-manager ${dragActive ? 'attachments-manager--drag' : ''}`}
      data-drop-title={t('dropFiles')}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragActive(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDrop={handleDrop}
    >
      <input
        className="note-tool-file-input"
        ref={fileInputRef}
        type="file"
        multiple
        disabled={!canUpload}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (!files.length) return;
          void runTool(() => uploadFiles(files), onSuccess, onError, t('saved'), t('saveError'));
        }}
      />

      <div className="attachments-manager__bar">
        <label className="search-box attachments-manager__search">
          <Search size={14} />
          <input
            value={query}
            placeholder={t('searchFiles')}
            onChange={(event) => setQuery(event.target.value.toLowerCase())}
          />
        </label>
        <div className="attachments-manager__counter">
          {selectedAttachmentIds.length
            ? `${t('selectedFiles')}: ${selectedAttachmentIds.length}`
            : `${filteredAttachments.length}/${attachments.length}`}
        </div>
        {selectedAttachmentIds.length ? (
          <div className="attachments-manager__selection-actions">
            <IconButton
              label={t('downloadSelected')}
              icon={<FileArchive size={15} />}
              onClick={() =>
                runTool(downloadArchive, onSuccess, onError, t('ready'), t('loadError'))
              }
            />
            <IconButton
              label={t('deleteSelected')}
              icon={<Trash2 size={15} />}
              variant="danger"
              onClick={() =>
                runTool(
                  () => deleteAttachments(selectedAttachmentIds),
                  onSuccess,
                  onError,
                  t('delete'),
                  t('deleteError'),
                )
              }
            />
            <IconButton
              label={t('clearSelection')}
              icon={<X size={15} />}
              onClick={() => {
                setSelectedIds(new Set());
                setLastSelectedId(null);
              }}
            />
          </div>
        ) : null}
        <div className="attachments-manager__actions">
          <IconButton
            label={t('upload')}
            icon={<UploadCloud size={16} />}
            disabled={!canUpload}
            onClick={() => fileInputRef.current?.click()}
          />
          <IconButton
            label={t('refresh')}
            icon={<RefreshCw size={16} />}
            onClick={() => runTool(refresh, onSuccess, onError, t('ready'), t('loadError'))}
          />
          <IconButton
            label={t('downloadZip')}
            icon={<FileArchive size={16} />}
            disabled={attachments.length === 0}
            onClick={() => runTool(downloadArchive, onSuccess, onError, t('ready'), t('loadError'))}
          />
          <IconButton
            label={selectedAttachmentIds.length ? t('delete') : t('deleteAll')}
            icon={<Trash2 size={16} />}
            variant="danger"
            disabled={!attachments.length}
            onClick={() =>
              runTool(
                () =>
                  deleteAttachments(
                    selectedAttachmentIds.length
                      ? selectedAttachmentIds
                      : attachments.map((attachment) => attachment.id),
                  ),
                onSuccess,
                onError,
                t('delete'),
                t('deleteError'),
              )
            }
          />
        </div>
      </div>

      <div className="attachments-manager__drop">
        <UploadCloud size={15} />
        <span>{t('dropFiles')}</span>
      </div>

      <div
        className="attachments-manager__body"
        ref={bodyRef}
        onClick={(event) => {
          if (
            (event.target as HTMLElement).closest(
              '.attachment-tile__menu, .attachment-tile__menu-button',
            )
          ) {
            return;
          }
          setActionMenu(null);
        }}
      >
        <div
          className="attachments-grid"
          role="list"
          aria-label={t('attachmentManager')}
          onScroll={() => setActionMenu(null)}
        >
          {filteredAttachments.map((attachment) => {
            const isSelected = selectedIds.has(attachment.id);
            const thumbnailUrl = thumbnailUrls[attachment.id];
            const extension = getFileExtension(attachment.fileName).toUpperCase() || 'FILE';
            return (
              <article
                className={`attachment-tile ${isSelected ? 'attachment-tile--selected' : ''}`}
                key={attachment.id}
                role="listitem"
                tabIndex={0}
                onClick={(event) => selectAttachment(attachment, event)}
                onDoubleClick={() =>
                  runTool(
                    () => openPreview(attachment),
                    onSuccess,
                    onError,
                    t('ready'),
                    t('loadError'),
                  )
                }
              >
                <button
                  className="attachment-tile__menu-button"
                  type="button"
                  aria-label={t('menu')}
                  onClick={(event) => openAttachmentMenu(attachment, event)}
                >
                  <MoreVertical size={14} />
                </button>
                <div className="attachment-tile__thumb">
                  {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt="" draggable={false} />
                  ) : (
                    <div className="attachment-tile__icon">{getAttachmentIcon(attachment)}</div>
                  )}
                  <span>{extension}</span>
                </div>
                <div className="attachment-tile__name">
                  {editingId === attachment.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onBlur={() =>
                        runTool(
                          () => commitRename(attachment),
                          onSuccess,
                          onError,
                          t('saved'),
                          t('saveError'),
                        )
                      }
                      onChange={(event) => setEditingName(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                        if (event.key === 'Escape') {
                          cancelRenameRef.current = true;
                          setEditingId(null);
                        }
                      }}
                    />
                  ) : (
                    <TooltipText value={attachment.fileName} className="attachment-tile__title" />
                  )}
                  <span>{formatFileSize(attachment.size)}</span>
                  {isAccountScope ? (
                    <div
                      className="attachment-tile__note"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <NotebookText size={13} />
                      <CustomSelect
                        label={t('attachToNote')}
                        value={
                          attachment.noteId &&
                          noteOptions.some((option) => option.value === String(attachment.noteId))
                            ? String(attachment.noteId)
                            : 'none'
                        }
                        options={noteOptions}
                        onChange={(value) =>
                          runTool(
                            () => attachToNote(attachment, value),
                            onSuccess,
                            onError,
                            t('saved'),
                            t('saveError'),
                          )
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {filteredAttachments.length === 0 ? (
            <div className="note-tool-empty note-tool-empty--inline">
              <Paperclip size={18} />
              {attachments.length ? t('noFilesFound') : t('emptyTree')}
            </div>
          ) : null}
        </div>

        {preview ? (
          <aside
            className="attachment-preview attachment-preview--floating"
            draggable={false}
            style={
              previewFrame
                ? {
                    left: previewFrame.x,
                    top: previewFrame.y,
                    width: previewFrame.width,
                    height: previewFrame.height,
                  }
                : undefined
            }
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={startPreviewMove}
          >
            <div className="attachment-preview__head">
              <TooltipText
                value={preview.attachment.fileName}
                className="attachment-preview__title"
              />
              <div className="attachment-preview__actions">
                <IconButton
                  label={t('download')}
                  icon={<Download size={15} />}
                  onClick={() =>
                    runTool(
                      () => downloadFile(preview.attachment),
                      onSuccess,
                      onError,
                      t('ready'),
                      t('loadError'),
                    )
                  }
                />
                <IconButton
                  label={t('close')}
                  icon={<X size={15} />}
                  onClick={() =>
                    setPreview((current) => {
                      if (current) URL.revokeObjectURL(current.url);
                      return null;
                    })
                  }
                />
              </div>
            </div>
            <div className="attachment-preview__body">
              {preview.kind === 'image' ? (
                <img
                  className="attachment-preview__media"
                  src={preview.url}
                  alt=""
                  draggable={false}
                />
              ) : preview.kind === 'video' ? (
                <video
                  className="attachment-preview__media"
                  src={preview.url}
                  controls
                  draggable={false}
                />
              ) : preview.kind === 'audio' ? (
                <audio className="attachment-preview__audio" src={preview.url} controls />
              ) : preview.kind === 'text' ? (
                <pre className="attachment-preview__text">{preview.text}</pre>
              ) : preview.kind === 'pdf' ? (
                <iframe
                  className="attachment-preview__frame"
                  src={preview.url}
                  title={preview.attachment.fileName}
                />
              ) : (
                <div className="attachment-preview__unsupported">
                  <FileArchive size={26} />
                  <strong>{t('previewUnavailable')}</strong>
                  <span>{t('unsupportedPreview')}</span>
                  <IconButton
                    label={t('download')}
                    icon={<Download size={16} />}
                    onClick={() =>
                      runTool(
                        () => downloadFile(preview.attachment),
                        onSuccess,
                        onError,
                        t('ready'),
                        t('loadError'),
                      )
                    }
                  />
                </div>
              )}
            </div>
            {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeEdge[]).map((edge) => (
              <span
                aria-hidden="true"
                className={`attachment-preview__resize attachment-preview__resize--${edge}`}
                key={edge}
                onPointerDown={(event) => startPreviewResize(edge, event)}
              />
            ))}
          </aside>
        ) : null}

        {actionMenu && actionMenuAttachment ? (
          <div
            className="attachment-tile__menu attachment-tile__menu--floating"
            style={{ left: actionMenu.x, top: actionMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setActionMenu(null);
                void runTool(
                  () => openPreview(actionMenuAttachment),
                  onSuccess,
                  onError,
                  t('ready'),
                  t('loadError'),
                );
              }}
            >
              <Eye size={14} />
              <TooltipText value={t('openPreview')} className="attachment-tile__menu-label" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActionMenu(null);
                void runTool(
                  () => openInBrowser(actionMenuAttachment),
                  onSuccess,
                  onError,
                  t('ready'),
                  t('loadError'),
                );
              }}
            >
              <ExternalLink size={14} />
              <TooltipText value={t('openInBrowser')} className="attachment-tile__menu-label" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActionMenu(null);
                beginRename(actionMenuAttachment);
              }}
            >
              <Pencil size={14} />
              <TooltipText value={t('rename')} className="attachment-tile__menu-label" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActionMenu(null);
                void runTool(
                  () => downloadFile(actionMenuAttachment),
                  onSuccess,
                  onError,
                  t('ready'),
                  t('loadError'),
                );
              }}
            >
              <Download size={14} />
              <TooltipText value={t('download')} className="attachment-tile__menu-label" />
            </button>
            {isAccountScope && (actionMenuAttachment.noteId || selectedNoteId) ? (
              <button
                type="button"
                onClick={() => {
                  setActionMenu(null);
                  void runTool(
                    () =>
                      attachToNote(
                        actionMenuAttachment,
                        actionMenuAttachment.noteId ? 'none' : String(selectedNoteId),
                      ),
                    onSuccess,
                    onError,
                    t('saved'),
                    t('saveError'),
                  );
                }}
              >
                <Link2 size={14} />
                <TooltipText
                  value={actionMenuAttachment.noteId ? t('detachFromNote') : t('attachToNote')}
                  className="attachment-tile__menu-label"
                />
              </button>
            ) : null}
            <button
              className="attachment-tile__menu-danger"
              type="button"
              onClick={() => {
                setActionMenu(null);
                void runTool(
                  () => deleteAttachments([actionMenuAttachment.id]),
                  onSuccess,
                  onError,
                  t('delete'),
                  t('deleteError'),
                );
              }}
            >
              <Trash2 size={14} />
              <TooltipText value={t('delete')} className="attachment-tile__menu-label" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
