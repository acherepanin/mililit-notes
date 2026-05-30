import { ChevronRight, FolderInput, FolderPlus, Paperclip, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import { notesApi, workspaceApi } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { useConfirmDelete } from '../../components/DeleteConfirmationProvider';
import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { Attachment, AttachmentFolder, Note, NoteDraft, NoteTreeNode } from '../../types';
import { AttachmentPreviewOverlay } from './AttachmentOverlays';
import {
  FileManagerContextMenu,
  type FileManagerContextMenuState,
} from './FileManagerContextMenu';
import { FileManagerMovePicker } from './FileManagerMovePicker';
import {
  FileManagerPropertiesDialog,
  type FileManagerPropertiesTarget,
} from './FileManagerPropertiesDialog';
import {
  attachmentKey,
  buildFolderBreadcrumb,
  buildFolderPathLabel,
  buildNotePickerOptions,
  copyFolderTree,
  FILE_MANAGER_DND_TYPE,
  filterVisibleAttachments,
  filterVisibleFolders,
  folderKey,
  isExternalFileDrag,
  isInvalidFolderMoveTarget,
  parseDragPayload,
  type FileManagerClipboard,
  type GridSelectionKey,
} from './fileManager.helpers';
import {
  clampPreviewFrame,
  fileToBase64,
  FolderTileIcon,
  getAttachmentIcon,
  getFileExtension,
  getPreviewKind,
  type AttachmentPreview,
  type PreviewFrame,
  type PreviewInteraction,
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

export interface AttachmentsPanelProps extends PanelProps {
  scope?: 'note' | 'account';
  notesTree?: NoteTreeNode[];
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

function isAttachmentLinkedToNote(
  attachment: Attachment,
  noteOptions: ReturnType<typeof buildNotePickerOptions>,
): boolean {
  return (
    attachment.noteId !== null && noteOptions.some((option) => option.id === attachment.noteId)
  );
}

function rectsIntersect(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function AttachmentsPanel({
  t,
  selectedNote,
  onReloadNote,
  onSuccess,
  onError,
  scope = 'note',
  notesTree = [],
}: AttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [folders, setFolders] = useState<AttachmentFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<number>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());
  const [lastSelectedKey, setLastSelectedKey] = useState<GridSelectionKey | null>(null);
  const [clipboard, setClipboard] = useState<FileManagerClipboard>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [hoverDropFolderId, setHoverDropFolderId] = useState<number | null>(null);
  const [propertiesTarget, setPropertiesTarget] = useState<FileManagerPropertiesTarget | null>(null);
  const [editingAttachmentId, setEditingAttachmentId] = useState<number | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [contextMenu, setContextMenu] = useState<FileManagerContextMenuState | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [previewFrame, setPreviewFrame] = useState<PreviewFrame | null>(null);
  const [uploadFolderPickerAnchor, setUploadFolderPickerAnchor] = useState<DOMRect | null>(null);
  const [marqueeStyle, setMarqueeStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const confirmDelete = useConfirmDelete();
  const isAccountScope = scope === 'account';
  const selectedNoteId = selectedNote?.id ?? null;
  const canUpload = isAccountScope || Boolean(selectedNoteId);
  const noteOptions = useMemo(() => buildNotePickerOptions(notesTree), [notesTree]);

  const managerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRenameRef = useRef(false);
  const pendingNewFolderIdRef = useRef<number | null>(null);
  const previewInteractionRef = useRef<PreviewInteraction | null>(null);
  const marqueeAdditiveRef = useRef(false);
  const marqueeBaseAttachmentsRef = useRef<Set<number>>(new Set());
  const marqueeBaseFoldersRef = useRef<Set<number>>(new Set());
  const internalDragRef = useRef<{ attachmentIds: number[]; folderIds: number[] } | null>(null);
  const externalDragDepthRef = useRef(0);
  const folderGradientId = useId().replace(/:/g, '');

  const refresh = useCallback(async () => {
    if (isAccountScope) {
      const [nextAttachments, nextFolders] = await Promise.all([
        workspaceApi.listAccountAttachments(),
        workspaceApi.listAttachmentFolders(),
      ]);
      setAttachments(nextAttachments);
      setFolders(nextFolders);
      return;
    }

    if (!selectedNoteId) {
      setAttachments([]);
      setFolders([]);
      return;
    }
    const [nextAttachments, nextFolders] = await Promise.all([
      workspaceApi.listAttachments(selectedNoteId),
      workspaceApi.listAttachmentFolders(),
    ]);
    setAttachments(nextAttachments);
    setFolders(nextFolders);
  }, [isAccountScope, selectedNoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    clearSelection();
    setCurrentFolderId(null);
    setClipboard(null);
    setPreviewFrame(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
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
            if (!isCancelled) urls[attachment.id] = URL.createObjectURL(blob);
          } catch {
            // Missing thumbnails must not block the manager.
          }
        }),
      );
      if (!isCancelled) setThumbnailUrls(urls);
    }

    void loadThumbnails();
    return () => {
      isCancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const normalizedQuery = query.trim();
  const visibleFolders = useMemo(
    () =>
      isAccountScope
        ? filterVisibleFolders(folders, currentFolderId, normalizedQuery)
        : [],
    [currentFolderId, folders, isAccountScope, normalizedQuery],
  );
  const visibleAttachments = useMemo(
    () => filterVisibleAttachments(attachments, currentFolderId, normalizedQuery, isAccountScope),
    [attachments, currentFolderId, isAccountScope, normalizedQuery],
  );
  const breadcrumb = useMemo(
    () => (isAccountScope ? buildFolderBreadcrumb(folders, currentFolderId) : []),
    [currentFolderId, folders, isAccountScope],
  );
  const gridSelectionKeys = useMemo(
    () => [
      ...visibleFolders.map((folder) => folderKey(folder.id)),
      ...visibleAttachments.map((attachment) => attachmentKey(attachment.id)),
    ],
    [visibleAttachments, visibleFolders],
  );
  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => selectedAttachmentIds.has(attachment.id)),
    [attachments, selectedAttachmentIds],
  );
  const selectedFolders = useMemo(
    () => folders.filter((folder) => selectedFolderIds.has(folder.id)),
    [folders, selectedFolderIds],
  );
  const totalSelected = selectedAttachmentIds.size + selectedFolderIds.size;
  const hasBreadcrumb = isAccountScope && (breadcrumb.length > 0 || currentFolderId !== null);
  const hasMovableSelection = isAccountScope && totalSelected > 0;
  const noteUploadFolderLabel = useMemo(() => {
    if (isAccountScope || !selectedNote) {
      return '';
    }
    const folderId = selectedNote.attachmentFolderId ?? null;
    if (folderId === null) {
      return t('uploadFolderAuto');
    }
    return buildFolderPathLabel(folders, folderId, t('filesRoot'));
  }, [folders, isAccountScope, selectedNote, t]);
  const movingFolderIds = useMemo(() => [...selectedFolderIds], [selectedFolderIds]);

  const isFolderDropHighlight = useCallback(
    (folderId: number) => {
      if (!hasMovableSelection) {
        return false;
      }
      if (isInvalidFolderMoveTarget(folders, folderId, movingFolderIds)) {
        return false;
      }
      return hoverDropFolderId === folderId || dropTargetFolderId === folderId;
    },
    [dropTargetFolderId, folders, hasMovableSelection, hoverDropFolderId, movingFolderIds],
  );

  useEffect(() => {
    if (editingFolderId === null && editingAttachmentId === null) {
      return;
    }
    const selector = editingFolderId
      ? `[data-folder-id="${editingFolderId}"] .attachment-tile__name input`
      : `[data-attachment-id="${editingAttachmentId}"] .attachment-tile__name input`;
    const frameId = window.requestAnimationFrame(() => {
      const input = gridRef.current?.querySelector<HTMLInputElement>(selector);
      input?.focus();
      input?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editingAttachmentId, editingFolderId, visibleAttachments.length, visibleFolders.length]);

  useEffect(() => {
    if (editingAttachmentId === null && editingFolderId === null) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.attachment-tile__name input')) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && managerRef.current?.contains(active)) {
        active.blur();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [editingAttachmentId, editingFolderId]);

  const clearSelection = useCallback(() => {
    setSelectedAttachmentIds(new Set());
    setSelectedFolderIds(new Set());
    setLastSelectedKey(null);
    setContextMenu(null);
  }, []);

  const selectGridItem = (
    key: GridSelectionKey,
    event: Pick<MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ) => {
    const isAttachment = key.startsWith('a:');
    const id = Number(key.slice(2));

    if (event.shiftKey && lastSelectedKey) {
      const start = gridSelectionKeys.indexOf(lastSelectedKey);
      const end = gridSelectionKeys.indexOf(key);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        const nextAttachments = new Set<number>();
        const nextFolders = new Set<number>();
        gridSelectionKeys.slice(from, to + 1).forEach((itemKey) => {
          if (itemKey.startsWith('a:')) nextAttachments.add(Number(itemKey.slice(2)));
          else nextFolders.add(Number(itemKey.slice(2)));
        });
        setSelectedAttachmentIds(nextAttachments);
        setSelectedFolderIds(nextFolders);
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (isAttachment) {
        setSelectedAttachmentIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setSelectedFolderIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    } else {
      setSelectedAttachmentIds(isAttachment ? new Set([id]) : new Set());
      setSelectedFolderIds(isAttachment ? new Set() : new Set([id]));
    }
    setLastSelectedKey(key);
    setContextMenu(null);
  };

  const moveItems = async (
    attachmentIds: number[],
    folderIds: number[],
    targetFolderId: number | null,
  ) => {
    for (const folderId of folderIds) {
      try {
        await workspaceApi.moveAttachmentFolderParent(folderId, targetFolderId);
      } catch {
        onError(t('folderNameConflict'));
        return;
      }
    }
    for (const attachmentId of attachmentIds) {
      await workspaceApi.moveAttachmentToFolder(attachmentId, targetFolderId);
    }
    setContextMenu(null);
    clearSelection();
    await refresh();
  };

  const pasteClipboard = useCallback(async () => {
    if (!clipboard || !isAccountScope) {
      return;
    }
    const targetFolderId = currentFolderId;
    if (clipboard.mode === 'cut') {
      await moveItems(clipboard.attachmentIds, clipboard.folderIds, targetFolderId);
      setClipboard(null);
      return;
    }
    for (const attachmentId of clipboard.attachmentIds) {
      await workspaceApi.duplicateAttachment(attachmentId, targetFolderId);
    }
    for (const folderId of clipboard.folderIds) {
      await copyFolderTree(
        folders,
        attachments,
        folderId,
        targetFolderId,
        workspaceApi.createAttachmentFolder,
        workspaceApi.duplicateAttachment,
      );
    }
    setContextMenu(null);
    await refresh();
  }, [attachments, clipboard, currentFolderId, folders, isAccountScope]);

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const interaction = previewInteractionRef.current;
      if (interaction) {
        const bounds = managerRef.current?.getBoundingClientRect();
        const dx = event.clientX - interaction.startX;
        const dy = event.clientY - interaction.startY;
        if (interaction.type === 'move') {
          setPreviewFrame(
            clampPreviewFrame(
              { ...interaction.frame, x: interaction.frame.x + dx, y: interaction.frame.y + dy },
              bounds,
            ),
          );
        } else {
          const nextFrame = { ...interaction.frame };
          if (interaction.edge.includes('e')) nextFrame.width = interaction.frame.width + dx;
          if (interaction.edge.includes('s')) nextFrame.height = interaction.frame.height + dy;
          if (interaction.edge.includes('w')) {
            nextFrame.x = interaction.frame.x + dx;
            nextFrame.width = interaction.frame.width - dx;
          }
          if (interaction.edge.includes('n')) {
            nextFrame.y = interaction.frame.y + dy;
            nextFrame.height = interaction.frame.height - dy;
          }
          setPreviewFrame(clampPreviewFrame(nextFrame, bounds));
        }
        return;
      }

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!managerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) {
        const active = document.activeElement;
        if (active && !managerRef.current?.contains(active)) {
          return;
        }
      }
      if (!isAccountScope || totalSelected === 0) {
        if (isAccountScope && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && clipboard) {
          event.preventDefault();
          void runTool(() => pasteClipboard(), onSuccess, onError, t('saved'), t('saveError'));
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'x') {
        event.preventDefault();
        setClipboard({
          mode: 'cut',
          attachmentIds: [...selectedAttachmentIds],
          folderIds: [...selectedFolderIds],
        });
      } else if (key === 'c') {
        event.preventDefault();
        setClipboard({
          mode: 'copy',
          attachmentIds: [...selectedAttachmentIds],
          folderIds: [...selectedFolderIds],
        });
      } else if (key === 'v' && clipboard) {
        event.preventDefault();
        void runTool(() => pasteClipboard(), onSuccess, onError, t('saved'), t('saveError'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clipboard,
    isAccountScope,
    onError,
    onSuccess,
    pasteClipboard,
    selectedAttachmentIds,
    selectedFolderIds,
    t,
    totalSelected,
  ]);

  const uploadFiles = async (files: File[]) => {
    if (!canUpload) return;
    for (const file of files) {
      await workspaceApi.uploadAttachment({
        noteId: isAccountScope ? null : selectedNoteId,
        folderId: isAccountScope ? currentFolderId : (selectedNote?.attachmentFolderId ?? null),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      });
    }
    if (!isAccountScope && selectedNoteId) {
      await onReloadNote(selectedNoteId);
    }
    await refresh();
  };

  const bindNoteUploadFolder = async (folderId: number | null) => {
    if (!selectedNoteId) {
      return;
    }
    await notesApi.updateNote(selectedNoteId, { attachmentFolderId: folderId });
    await onReloadNote(selectedNoteId);
  };

  const downloadFile = async (attachment: Attachment) => {
    const blob = await workspaceApi.downloadAttachment(attachment.id);
    saveBlob(blob, attachment.fileName);
  };

  const downloadArchive = async (attachmentIds: number[], folderIds: number[]) => {
    if (isAccountScope) {
      const singleFolder =
        folderIds.length === 1 && attachmentIds.length === 0
          ? folders.find((folder) => folder.id === folderIds[0])
          : null;
      const archiveName = singleFolder ? `${singleFolder.name}.zip` : 'account-files.zip';
      saveBlob(
        await workspaceApi.downloadAccountAttachmentsArchive(attachmentIds, folderIds),
        archiveName,
      );
      return;
    }
    if (!selectedNoteId) return;
    saveBlob(
      await workspaceApi.downloadAttachmentsArchive(selectedNoteId, attachmentIds),
      `${selectedNote?.name ?? 'note'}-attachments.zip`,
    );
  };

  const downloadSelection = async (attachmentIds: number[], folderIds: number[]) => {
    if (
      folderIds.length === 0 &&
      attachmentIds.length === 1 &&
      selectedAttachments.length === 1
    ) {
      await downloadFile(selectedAttachments[0]!);
      return;
    }
    await downloadArchive(attachmentIds, folderIds);
  };

  const attachToNote = async (ids: number[], noteId: number | null) => {
    for (const id of ids) {
      await workspaceApi.attachAttachmentToNote(id, noteId);
    }
    await refresh();
  };

  const deleteAttachments = async (ids: number[]) => {
    for (const id of ids) {
      await workspaceApi.deleteAttachment(id);
    }
    clearSelection();
    await refresh();
  };

  const deleteFolders = async (ids: number[]) => {
    for (const id of ids) {
      await workspaceApi.deleteAttachmentFolder(id);
    }
    if (currentFolderId !== null && ids.includes(currentFolderId)) {
      setCurrentFolderId(null);
    }
    clearSelection();
    await refresh();
  };

  const confirmDeleteFolders = async (ids: number[]) => {
    if (!ids.length) {
      return false;
    }
    return confirmDelete({
      title: ids.length > 1 ? t('deleteSelected') : t('deleteFolder'),
      description: t('deleteFolderConfirm'),
    });
  };

  const confirmDeleteAttachments = async (ids: number[]) => {
    if (!ids.length) {
      return false;
    }
    return confirmDelete({
      title: ids.length > 1 ? t('deleteSelected') : t('delete'),
      description: ids.length > 1 ? t('deleteAttachmentsQuestion') : t('deleteAttachmentQuestion'),
    });
  };

  const openPreview = async (attachment: Attachment) => {
    const kind = getPreviewKind(attachment);
    const blob = await workspaceApi.downloadAttachment(attachment.id);
    const url = URL.createObjectURL(blob);
    const text = kind === 'text' ? await blob.text() : undefined;
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { attachment, kind, url, text };
    });
    const bounds = managerRef.current?.getBoundingClientRect();
    if (bounds) {
      const width = Math.min(Math.max(bounds.width * 0.42, 380), bounds.width - 24);
      const height = Math.min(Math.max(bounds.height * 0.58, 300), bounds.height - 24);
      setPreviewFrame(
        clampPreviewFrame({ x: bounds.width - width - 12, y: 88, width, height }, bounds),
      );
    }
  };

  const openInBrowser = async (attachment: Attachment) => {
    const blob = await workspaceApi.downloadAttachment(attachment.id);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const openContextMenu = (
    clientX: number,
    clientY: number,
    itemKey?: GridSelectionKey,
  ) => {
    if (itemKey) {
      const isAttachment = itemKey.startsWith('a:');
      const id = Number(itemKey.slice(2));
      const alreadySelected = isAttachment
        ? selectedAttachmentIds.has(id)
        : selectedFolderIds.has(id);
      if (!alreadySelected) {
        setSelectedAttachmentIds(isAttachment ? new Set([id]) : new Set());
        setSelectedFolderIds(isAttachment ? new Set() : new Set([id]));
        setLastSelectedKey(itemKey);
      }
    }
    setContextMenu({ x: clientX, y: clientY });
  };

  const beginRenameAttachment = (attachment: Attachment) => {
    cancelRenameRef.current = false;
    setEditingAttachmentId(attachment.id);
    setEditingFolderId(null);
    setEditingName(attachment.fileName);
    setContextMenu(null);
  };

  const beginRenameFolder = (folder: AttachmentFolder) => {
    cancelRenameRef.current = false;
    setEditingFolderId(folder.id);
    setEditingAttachmentId(null);
    setEditingName(folder.name);
    setContextMenu(null);
  };

  const startEditingNewFolder = (folder: AttachmentFolder) => {
    pendingNewFolderIdRef.current = folder.id;
    beginRenameFolder(folder);
  };

  const commitRenameAttachment = async (attachment: Attachment) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditingAttachmentId(null);
      return;
    }
    const nextName = editingName.trim();
    setEditingAttachmentId(null);
    if (!nextName || nextName === attachment.fileName) return;
    await workspaceApi.renameAttachment(attachment.id, nextName);
    await refresh();
  };

  const commitRenameFolder = async (folder: AttachmentFolder) => {
    const isPendingNewFolder = pendingNewFolderIdRef.current === folder.id;
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditingFolderId(null);
      if (isPendingNewFolder) {
        pendingNewFolderIdRef.current = null;
        await workspaceApi.deleteAttachmentFolder(folder.id);
        await refresh();
      }
      return;
    }
    const nextName = editingName.trim();
    setEditingFolderId(null);
    if (!nextName) {
      if (isPendingNewFolder) {
        pendingNewFolderIdRef.current = null;
        await workspaceApi.deleteAttachmentFolder(folder.id);
        await refresh();
      }
      return;
    }
    pendingNewFolderIdRef.current = null;
    if (nextName === folder.name) return;
    try {
      await workspaceApi.renameAttachmentFolder(folder.id, nextName);
      await refresh();
    } catch {
      onError(t('folderNameConflict'));
    }
  };

  const createFolder = async (parentId: number | null) => {
    try {
      const created = await workspaceApi.createAttachmentFolder({
        name: t('newFolderDefault'),
        parentId,
      });
      await refresh();
      startEditingNewFolder(created);
    } catch {
      onError(t('folderNameConflict'));
    }
  };

  const getDragPayload = (itemKey?: GridSelectionKey) => {
    const attachmentIds =
      itemKey && itemKey.startsWith('a:') && !selectedAttachmentIds.has(Number(itemKey.slice(2)))
        ? [Number(itemKey.slice(2))]
        : [...selectedAttachmentIds];
    const folderIds =
      itemKey && itemKey.startsWith('f:') && !selectedFolderIds.has(Number(itemKey.slice(2)))
        ? [Number(itemKey.slice(2))]
        : [...selectedFolderIds];
    return { attachmentIds, folderIds };
  };

  const handleInternalDrop = async (targetFolderId: number | null, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetFolderId(null);
    const payload = parseDragPayload(event.dataTransfer) ?? internalDragRef.current;
    internalDragRef.current = null;
    if (!payload) {
      return;
    }
    await moveItems(payload.attachmentIds, payload.folderIds, targetFolderId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    externalDragDepthRef.current = 0;
    if (parseDragPayload(event.dataTransfer) || internalDragRef.current) {
      void handleInternalDrop(currentFolderId, event);
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    void runTool(() => uploadFiles(files), onSuccess, onError, t('saved'), t('saveError'));
  };

  const startGridMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-attachment-id], [data-folder-id], button, input, textarea, a, label')) {
      return;
    }

    const grid = gridRef.current;
    if (!grid) return;

    event.preventDefault();
    grid.setPointerCapture(event.pointerId);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    marqueeAdditiveRef.current = event.ctrlKey || event.metaKey || event.shiftKey;
    marqueeBaseAttachmentsRef.current = marqueeAdditiveRef.current
      ? new Set(selectedAttachmentIds)
      : new Set<number>();
    marqueeBaseFoldersRef.current = marqueeAdditiveRef.current
      ? new Set(selectedFolderIds)
      : new Set<number>();
    if (!marqueeAdditiveRef.current) {
      clearSelection();
    }
    setContextMenu(null);

    const updateMarquee = (clientX: number, clientY: number) => {
      const gridRect = grid.getBoundingClientRect();
      setMarqueeStyle({
        left: Math.min(startClientX, clientX) - gridRect.left + grid.scrollLeft,
        top: Math.min(startClientY, clientY) - gridRect.top + grid.scrollTop,
        width: Math.abs(clientX - startClientX),
        height: Math.abs(clientY - startClientY),
      });
    };

    updateMarquee(startClientX, startClientY);

    const finishMarquee = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      if (grid.hasPointerCapture(pointerEvent.pointerId)) {
        grid.releasePointerCapture(pointerEvent.pointerId);
      }
      grid.removeEventListener('pointermove', onPointerMove);
      grid.removeEventListener('pointerup', finishMarquee);
      grid.removeEventListener('pointercancel', finishMarquee);

      const selectionRect = {
        left: Math.min(startClientX, pointerEvent.clientX),
        top: Math.min(startClientY, pointerEvent.clientY),
        right: Math.max(startClientX, pointerEvent.clientX),
        bottom: Math.max(startClientY, pointerEvent.clientY),
      };
      const nextAttachments = new Set(marqueeBaseAttachmentsRef.current);
      const nextFolders = new Set(marqueeBaseFoldersRef.current);
      const tiles = grid.querySelectorAll<HTMLElement>('[data-attachment-id], [data-folder-id]');
      tiles.forEach((tile) => {
        if (!rectsIntersect(tile.getBoundingClientRect(), selectionRect)) {
          return;
        }
        const attachmentId = tile.dataset.attachmentId;
        const folderId = tile.dataset.folderId;
        if (attachmentId) nextAttachments.add(Number(attachmentId));
        if (folderId) nextFolders.add(Number(folderId));
      });
      setSelectedAttachmentIds(nextAttachments);
      setSelectedFolderIds(nextFolders);
      const lastAttachment = [...nextAttachments].at(-1);
      const lastFolder = [...nextFolders].at(-1);
      if (lastAttachment !== undefined) setLastSelectedKey(attachmentKey(lastAttachment));
      else if (lastFolder !== undefined) setLastSelectedKey(folderKey(lastFolder));
      else setLastSelectedKey(null);
      setMarqueeStyle(null);
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      updateMarquee(pointerEvent.clientX, pointerEvent.clientY);
    };

    grid.addEventListener('pointermove', onPointerMove);
    grid.addEventListener('pointerup', finishMarquee);
    grid.addEventListener('pointercancel', finishMarquee);
  };

  const enterFolder = (folderId: number) => {
    setCurrentFolderId(folderId);
    clearSelection();
    setQuery('');
  };

  const renderFolderTile = (folder: AttachmentFolder) => {
    const isSelected = selectedFolderIds.has(folder.id);
    const isDropHighlight = isFolderDropHighlight(folder.id);
    return (
      <article
        className={`attachment-tile file-manager__tile file-manager__tile--folder ${
          isSelected ? 'attachment-tile--selected file-manager__tile--selected' : ''
        } ${isDropHighlight ? 'file-manager__tile--drop-target' : ''}`}
        key={`folder-${folder.id}`}
        role="listitem"
        data-folder-id={folder.id}
        draggable={isAccountScope}
        tabIndex={0}
        onMouseEnter={() => {
          if (hasMovableSelection && !isInvalidFolderMoveTarget(folders, folder.id, movingFolderIds)) {
            setHoverDropFolderId(folder.id);
          }
        }}
        onMouseLeave={() => {
          if (hoverDropFolderId === folder.id) {
            setHoverDropFolderId(null);
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          selectGridItem(folderKey(folder.id), event);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openContextMenu(event.clientX, event.clientY, folderKey(folder.id));
        }}
        onDoubleClick={() => enterFolder(folder.id)}
        onDragStart={(event) => {
          if (!isAccountScope) return;
          const payload = getDragPayload(folderKey(folder.id));
          internalDragRef.current = payload;
          event.dataTransfer.setData(FILE_MANAGER_DND_TYPE, JSON.stringify(payload));
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          internalDragRef.current = null;
          setDropTargetFolderId(null);
          setDragActive(false);
          externalDragDepthRef.current = 0;
        }}
        onDragOver={(event) => {
          if (!isAccountScope || !internalDragRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          setDropTargetFolderId(folder.id);
        }}
        onDragLeave={() => {
          if (dropTargetFolderId === folder.id) setDropTargetFolderId(null);
        }}
        onDrop={(event) => {
          void runTool(
            () => handleInternalDrop(folder.id, event),
            onSuccess,
            onError,
            t('saved'),
            t('saveError'),
          );
        }}
      >
        <div className="attachment-tile__thumb attachment-tile__thumb--folder">
          <FolderTileIcon gradientId={folderGradientId} />
        </div>
        <div className="attachment-tile__name attachment-tile__name--folder">
          {editingFolderId === folder.id ? (
            <input
              autoFocus
              autoComplete="off"
              value={editingName}
              onBlur={() =>
                runTool(
                  () => commitRenameFolder(folder),
                  onSuccess,
                  onError,
                  t('saved'),
                  t('saveError'),
                )
              }
              onChange={(event) => setEditingName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  cancelRenameRef.current = true;
                  setEditingFolderId(null);
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <>
              <TooltipText value={folder.name} className="attachment-tile__title" />
              {normalizedQuery ? (
                <TooltipText
                  value={buildFolderPathLabel(folders, folder.id, t('filesRoot'))}
                  className="attachment-tile__folder-path"
                />
              ) : null}
            </>
          )}
        </div>
      </article>
    );
  };

  const isEmpty =
    visibleAttachments.length === 0 && (!isAccountScope || visibleFolders.length === 0);

  return (
    <div
      ref={managerRef}
      className={`attachments-manager file-manager ${
        dragActive ? 'attachments-manager--drag' : ''
      } ${hasBreadcrumb ? 'attachments-manager--with-crumb' : ''}`}
      data-drop-title={t('dropFiles')}
      tabIndex={-1}
      onDragEnter={(event) => {
        if (internalDragRef.current) return;
        if (!isExternalFileDrag(event.dataTransfer, false)) return;
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        event.preventDefault();
        externalDragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (internalDragRef.current) return;
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        externalDragDepthRef.current = Math.max(0, externalDragDepthRef.current - 1);
        if (externalDragDepthRef.current === 0) {
          setDragActive(false);
        }
      }}
      onDragOver={(event) => {
        if (internalDragRef.current) return;
        if (!isExternalFileDrag(event.dataTransfer, false)) return;
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

      {!isAccountScope && selectedNote ? (
        <div className="file-manager__note-folder">
          <span className="file-manager__note-folder-label">{t('uploadFolderLabel')}</span>
          <TooltipText value={noteUploadFolderLabel} className="file-manager__note-folder-value" />
          <button
            type="button"
            className="file-manager__note-folder-button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setUploadFolderPickerAnchor((current) => (current ? null : rect));
            }}
          >
            <FolderInput size={14} aria-hidden />
            {t('chooseUploadFolder')}
          </button>
        </div>
      ) : null}

      <div className="attachments-manager__bar file-manager__bar">
        <label className="search-box attachments-manager__search file-manager__search">
          <Search size={14} />
          <input
            autoComplete="off"
            value={query}
            placeholder={t('searchFiles')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="file-manager__bar-actions">
          {isAccountScope ? (
            <IconButton
              label={t('newFolder')}
              icon={<FolderPlus size={16} />}
              onClick={() =>
                runTool(
                  () => createFolder(currentFolderId),
                  onSuccess,
                  onError,
                  t('saved'),
                  t('saveError'),
                )
              }
            />
          ) : null}
          <IconButton
            label={t('refresh')}
            icon={<RefreshCw size={16} />}
            onClick={() => runTool(refresh, onSuccess, onError, t('ready'), t('loadError'))}
          />
        </div>
      </div>

      {hasBreadcrumb ? (
        <nav className="file-manager__breadcrumb" aria-label={t('filesInFolder')}>
          <button type="button" onClick={() => setCurrentFolderId(null)}>
            {t('filesRoot')}
          </button>
          {breadcrumb.map((folder) => (
            <span key={folder.id} className="file-manager__breadcrumb-segment">
              <ChevronRight size={12} aria-hidden />
              <button type="button" onClick={() => setCurrentFolderId(folder.id)}>
                {folder.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="attachments-manager__drop">
        <Paperclip size={15} aria-hidden />
        <span>{t('dropFiles')}</span>
      </div>

      <div className="file-manager__workspace">
        <div
          className="attachments-manager__body file-manager__body"
          onContextMenu={(event) => {
            event.preventDefault();
            openContextMenu(event.clientX, event.clientY);
          }}
        >
          <div
            ref={gridRef}
            className="attachments-grid file-manager__grid"
            role="list"
            aria-label={t('attachmentManager')}
            onPointerDown={startGridMarquee}
            onClick={(event) => {
              if (event.target === event.currentTarget) clearSelection();
            }}
            onDragOver={(event) => {
              if (!isAccountScope || !internalDragRef.current) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!isAccountScope || !parseDragPayload(event.dataTransfer)) {
                internalDragRef.current = null;
                return;
              }
              void runTool(
                () => handleInternalDrop(currentFolderId, event),
                onSuccess,
                onError,
                t('saved'),
                t('saveError'),
              );
            }}
          >
            {marqueeStyle ? (
              <div className="file-manager__marquee" style={marqueeStyle} aria-hidden />
            ) : null}
            {isAccountScope ? visibleFolders.map(renderFolderTile) : null}
            {visibleAttachments.map((attachment) => {
              const isSelected = selectedAttachmentIds.has(attachment.id);
              const thumbnailUrl = thumbnailUrls[attachment.id];
              const extension = getFileExtension(attachment.fileName).toUpperCase() || 'FILE';
              const linked = isAttachmentLinkedToNote(attachment, noteOptions);
              return (
                <article
                  className={`attachment-tile file-manager__tile ${
                    isSelected ? 'attachment-tile--selected file-manager__tile--selected' : ''
                  }`}
                  key={attachment.id}
                  role="listitem"
                  data-attachment-id={attachment.id}
                  draggable={isAccountScope}
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectGridItem(attachmentKey(attachment.id), event);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openContextMenu(event.clientX, event.clientY, attachmentKey(attachment.id));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectGridItem(attachmentKey(attachment.id), {
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                      });
                    }
                  }}
                  onDoubleClick={() =>
                    runTool(
                      () => openPreview(attachment),
                      onSuccess,
                      onError,
                      t('ready'),
                      t('loadError'),
                    )
                  }
                  onDragStart={(event) => {
                    if (!isAccountScope) return;
                    const payload = getDragPayload(attachmentKey(attachment.id));
                    internalDragRef.current = payload;
                    event.dataTransfer.setData(FILE_MANAGER_DND_TYPE, JSON.stringify(payload));
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    internalDragRef.current = null;
                    setDragActive(false);
                    externalDragDepthRef.current = 0;
                  }}
                >
                  <div className="attachment-tile__thumb">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" draggable={false} />
                    ) : (
                      <div className="attachment-tile__icon">{getAttachmentIcon(attachment)}</div>
                    )}
                    <span>{extension}</span>
                  </div>
                  <div className="attachment-tile__name">
                    {editingAttachmentId === attachment.id ? (
                      <input
                        autoFocus
                        autoComplete="off"
                        value={editingName}
                        onBlur={() =>
                          runTool(
                            () => commitRenameAttachment(attachment),
                            onSuccess,
                            onError,
                            t('saved'),
                            t('saveError'),
                          )
                        }
                        onChange={(event) => setEditingName(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            cancelRenameRef.current = true;
                            setEditingAttachmentId(null);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <TooltipText value={attachment.fileName} className="attachment-tile__title" />
                    )}
                    {isAccountScope && attachment.noteId ? (
                      <span
                        className={`attachment-tile__note-badge ${
                          linked ? '' : 'attachment-tile__note-badge--orphan'
                        }`}
                      >
                        {linked ? attachment.noteName : t('noteLinkMissing')}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {isEmpty ? (
              <EmptyState
                className="file-manager__empty"
                tone="inline"
                title={attachments.length ? t('noFilesFound') : t('emptyTree')}
              >
                <Paperclip size={18} aria-hidden />
              </EmptyState>
            ) : null}
          </div>

          <AttachmentPreviewOverlay
            frame={previewFrame}
            preview={preview}
            t={t}
            onClose={() =>
              setPreview((current) => {
                if (current) URL.revokeObjectURL(current.url);
                return null;
              })
            }
            onDownload={(attachment) =>
              runTool(() => downloadFile(attachment), onSuccess, onError, t('ready'), t('loadError'))
            }
            onPointerDown={(event) => {
              if (
                (event.target as HTMLElement).closest(
                  'button, audio, video, iframe, .attachment-preview__resize',
                )
              ) {
                return;
              }
              if (!previewFrame) return;
              event.preventDefault();
              previewInteractionRef.current = {
                type: 'move',
                startX: event.clientX,
                startY: event.clientY,
                frame: previewFrame,
              };
            }}
            onResizeStart={(edge, event) => {
              if (!previewFrame) return;
              event.preventDefault();
              event.stopPropagation();
              previewInteractionRef.current = {
                type: 'resize',
                edge,
                startX: event.clientX,
                startY: event.clientY,
                frame: previewFrame,
              };
            }}
          />
        </div>
      </div>

      <FileManagerContextMenu
        menu={contextMenu}
        selectedAttachments={selectedAttachments}
        selectedFolders={selectedFolders}
        canUpload={canUpload}
        isAccountScope={isAccountScope}
        allFolders={folders}
        noteOptions={noteOptions}
        hasClipboard={Boolean(clipboard)}
        t={t}
        onClose={() => setContextMenu(null)}
        onOpenPreview={(attachment) =>
          runTool(() => openPreview(attachment), onSuccess, onError, t('ready'), t('loadError'))
        }
        onOpenBrowser={(attachment) =>
          runTool(() => openInBrowser(attachment), onSuccess, onError, t('ready'), t('loadError'))
        }
        onRenameAttachment={beginRenameAttachment}
        onRenameFolder={beginRenameFolder}
        onOpenProperties={(target) => {
          setPropertiesTarget(target);
          setContextMenu(null);
        }}
        onDownload={(attachmentIds, folderIds) =>
          runTool(
            () => downloadSelection(attachmentIds, folderIds),
            onSuccess,
            onError,
            t('ready'),
            t('loadError'),
          )
        }
        onDeleteAttachments={(ids) =>
          runTool(
            async () => {
              if (!(await confirmDeleteAttachments(ids))) {
                return;
              }
              await deleteAttachments(ids);
            },
            onSuccess,
            onError,
            t('delete'),
            t('deleteError'),
          )
        }
        onDeleteFolders={(ids) =>
          runTool(
            async () => {
              if (!(await confirmDeleteFolders(ids))) {
                return;
              }
              await deleteFolders(ids);
            },
            onSuccess,
            onError,
            t('delete'),
            t('deleteError'),
          )
        }
        onAttachToNote={(ids, noteId) =>
          runTool(() => attachToNote(ids, noteId), onSuccess, onError, t('saved'), t('saveError'))
        }
        onMoveItems={(attachmentIds, folderIds, targetFolderId) =>
          runTool(
            () => moveItems(attachmentIds, folderIds, targetFolderId),
            onSuccess,
            onError,
            t('saved'),
            t('saveError'),
          )
        }
        onCut={() =>
          setClipboard({
            mode: 'cut',
            attachmentIds: [...selectedAttachmentIds],
            folderIds: [...selectedFolderIds],
          })
        }
        onCopy={() =>
          setClipboard({
            mode: 'copy',
            attachmentIds: [...selectedAttachmentIds],
            folderIds: [...selectedFolderIds],
          })
        }
        onPaste={() =>
          runTool(() => pasteClipboard(), onSuccess, onError, t('saved'), t('saveError'))
        }
        onUpload={() => {
          setContextMenu(null);
          fileInputRef.current?.click();
        }}
        onNewFolder={() =>
          runTool(
            () => createFolder(currentFolderId),
            onSuccess,
            onError,
            t('saved'),
            t('saveError'),
          )
        }
      />

      <FileManagerPropertiesDialog
        target={propertiesTarget}
        folders={folders}
        attachments={attachments}
        t={t}
        onClose={() => setPropertiesTarget(null)}
      />

      {totalSelected === 1 ? (
        <div className="file-manager__mobile-actions">
          <button
            type="button"
            onClick={() => openContextMenu(window.innerWidth / 2, window.innerHeight - 80)}
          >
            {t('openActionsMenu')} ({totalSelected})
          </button>
        </div>
      ) : null}

      {uploadFolderPickerAnchor && !isAccountScope ? (
        <FileManagerMovePicker
          anchorRect={uploadFolderPickerAnchor}
          folders={folders}
          movingFolderIds={[]}
          t={t}
          onClose={() => setUploadFolderPickerAnchor(null)}
          onSelect={(folderId) => {
            setUploadFolderPickerAnchor(null);
            void runTool(
              () => bindNoteUploadFolder(folderId),
              onSuccess,
              onError,
              t('saved'),
              t('saveError'),
            );
          }}
        />
      ) : null}
    </div>
  );
}
