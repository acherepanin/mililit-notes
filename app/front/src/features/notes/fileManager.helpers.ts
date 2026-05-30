import type { Attachment, AttachmentFolder, NoteTreeNode } from '../../types';

export const FILE_MANAGER_DND_TYPE = 'application/x-notes-file-manager';

export interface FileManagerDragPayload {
  attachmentIds: number[];
  folderIds: number[];
}

export type FileManagerClipboard =
  | {
      mode: 'cut' | 'copy';
      attachmentIds: number[];
      folderIds: number[];
    }
  | null;

export type GridSelectionKey = `a:${number}` | `f:${number}`;

export function attachmentKey(id: number): GridSelectionKey {
  return `a:${id}`;
}

export function folderKey(id: number): GridSelectionKey {
  return `f:${id}`;
}

export function collectDescendantFolderIds(
  folders: AttachmentFolder[],
  rootId: number,
): number[] {
  const collected = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) {
      continue;
    }
    for (const folder of folders) {
      if (folder.parentId === currentId && !collected.has(folder.id)) {
        collected.add(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return [...collected];
}

export function isInvalidFolderMoveTarget(
  folders: AttachmentFolder[],
  targetFolderId: number | null,
  movingFolderIds: number[],
): boolean {
  if (targetFolderId === null) {
    return false;
  }
  for (const movingId of movingFolderIds) {
    if (targetFolderId === movingId) {
      return true;
    }
    const descendants = collectDescendantFolderIds(folders, movingId);
    if (descendants.includes(targetFolderId)) {
      return true;
    }
  }
  return false;
}

export function buildFolderPathLabel(
  folders: AttachmentFolder[],
  folderId: number,
  rootLabel: string,
): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const segments: string[] = [];
  let current: number | null = folderId;
  while (current !== null) {
    const folder = byId.get(current);
    if (!folder) {
      break;
    }
    segments.unshift(folder.name);
    current = folder.parentId;
  }
  return segments.length ? `${rootLabel} / ${segments.join(' / ')}` : rootLabel;
}

export function buildFolderBreadcrumb(
  folders: AttachmentFolder[],
  currentFolderId: number | null,
): AttachmentFolder[] {
  if (currentFolderId === null) {
    return [];
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: AttachmentFolder[] = [];
  let current: number | null = currentFolderId;
  while (current !== null) {
    const folder = byId.get(current);
    if (!folder) {
      break;
    }
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

export interface FolderPickerOption {
  id: number;
  name: string;
  path: string;
}

export function buildFolderPickerOptions(
  folders: AttachmentFolder[],
  movingFolderIds: number[],
  rootLabel: string,
): FolderPickerOption[] {
  const blocked = new Set<number>();
  for (const folderId of movingFolderIds) {
    collectDescendantFolderIds(folders, folderId).forEach((id) => blocked.add(id));
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const buildPath = (folderId: number): string => {
    const segments: string[] = [];
    let current: number | null = folderId;
    while (current !== null) {
      const folder = byId.get(current);
      if (!folder) break;
      segments.unshift(folder.name);
      current = folder.parentId;
    }
    return segments.length ? `${rootLabel} / ${segments.join(' / ')}` : rootLabel;
  };

  return folders
    .filter((folder) => !blocked.has(folder.id))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: buildPath(folder.id),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: 'base' }));
}

export function isExternalFileDrag(dataTransfer: DataTransfer, hasInternalDrag: boolean): boolean {
  if (hasInternalDrag) {
    return false;
  }
  return [...dataTransfer.types].includes('Files');
}

export interface FolderStats {
  directFileCount: number;
  directFolderCount: number;
  totalFileCount: number;
  totalFolderCount: number;
  totalSize: number;
}

export function computeFolderStats(
  folderId: number,
  folders: AttachmentFolder[],
  attachments: Attachment[],
): FolderStats {
  const descendantIds = collectDescendantFolderIds(folders, folderId);
  const descendantSet = new Set(descendantIds);
  const directFiles = attachments.filter((attachment) => attachment.folderId === folderId);
  const directFolders = folders.filter((folder) => folder.parentId === folderId);
  const treeFiles = attachments.filter(
    (attachment) => attachment.folderId != null && descendantSet.has(attachment.folderId),
  );
  const treeFolders = folders.filter(
    (folder) => descendantSet.has(folder.id) && folder.id !== folderId,
  );

  return {
    directFileCount: directFiles.length,
    directFolderCount: directFolders.length,
    totalFileCount: treeFiles.length,
    totalFolderCount: treeFolders.length,
    totalSize: treeFiles.reduce((sum, attachment) => sum + attachment.size, 0),
  };
}

export interface NotePickerOption {
  id: number;
  name: string;
  path: string;
}

export function buildNotePickerOptions(nodes: NoteTreeNode[]): NotePickerOption[] {
  const options: NotePickerOption[] = [];
  const walk = (items: NoteTreeNode[], parentSegments: string[] = []) => {
    for (const item of items) {
      const segments = [...parentSegments, item.name];
      options.push({
        id: item.id,
        name: item.name,
        path: segments.join(' / '),
      });
      walk(item.children, segments);
    }
  };
  walk(nodes);
  return options;
}

export function getLinkedNotesFromAttachments(
  attachments: Attachment[],
  noteOptions: NotePickerOption[],
  missingNoteLabel: string,
): NotePickerOption[] {
  const byId = new Map(noteOptions.map((option) => [option.id, option]));
  const linked: NotePickerOption[] = [];
  const seen = new Set<number>();
  for (const attachment of attachments) {
    if (attachment.noteId === null || seen.has(attachment.noteId)) {
      continue;
    }
    seen.add(attachment.noteId);
    const existing = byId.get(attachment.noteId);
    linked.push(
      existing ?? {
        id: attachment.noteId,
        name: attachment.noteName ?? missingNoteLabel,
        path: attachment.noteName ?? missingNoteLabel,
      },
    );
  }
  return linked;
}

export function buildFolderLocationPath(
  folderId: number | null,
  folders: AttachmentFolder[],
  rootLabel: string,
): string {
  if (folderId === null) {
    return rootLabel;
  }
  const breadcrumb = buildFolderBreadcrumb(folders, folderId);
  if (breadcrumb.length === 0) {
    return rootLabel;
  }
  return [rootLabel, ...breadcrumb.map((folder) => folder.name)].join(' / ');
}

export function parseDragPayload(dataTransfer: DataTransfer): FileManagerDragPayload | null {
  const raw = dataTransfer.getData(FILE_MANAGER_DND_TYPE);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as FileManagerDragPayload;
    return {
      attachmentIds: Array.isArray(parsed.attachmentIds) ? parsed.attachmentIds : [],
      folderIds: Array.isArray(parsed.folderIds) ? parsed.folderIds : [],
    };
  } catch {
    return null;
  }
}

export function filterVisibleFolders(
  folders: AttachmentFolder[],
  currentFolderId: number | null,
  query: string,
): AttachmentFolder[] {
  const normalized = query.trim().toLowerCase();
  if (normalized) {
    return folders.filter((folder) => folder.name.toLowerCase().includes(normalized));
  }
  return folders.filter((folder) => (folder.parentId ?? null) === currentFolderId);
}

export function filterVisibleAttachments(
  attachments: Attachment[],
  currentFolderId: number | null,
  query: string,
  isAccountScope: boolean,
): Attachment[] {
  let list = attachments;
  if (isAccountScope && !query.trim()) {
    list = list.filter((attachment) => (attachment.folderId ?? null) === currentFolderId);
  }
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return list;
  }
  return list.filter((attachment) => {
    const name = attachment.fileName.toLowerCase();
    const extension = attachment.fileName.split('.').pop()?.toLowerCase() ?? '';
    const noteName = attachment.noteName?.toLowerCase() ?? '';
    return (
      name.includes(normalized) ||
      extension.includes(normalized) ||
      noteName.includes(normalized)
    );
  });
}

export async function copyFolderTree(
  folders: AttachmentFolder[],
  attachments: Attachment[],
  sourceFolderId: number,
  targetParentId: number | null,
  createFolder: (payload: { name: string; parentId: number | null }) => Promise<AttachmentFolder>,
  duplicateAttachment: (id: number, folderId: number | null) => Promise<Attachment>,
): Promise<void> {
  const source = folders.find((folder) => folder.id === sourceFolderId);
  if (!source) {
    return;
  }
  const created = await createFolder({ name: source.name, parentId: targetParentId });
  const files = attachments.filter((attachment) => attachment.folderId === sourceFolderId);
  for (const file of files) {
    await duplicateAttachment(file.id, created.id);
  }
  const children = folders.filter((folder) => folder.parentId === sourceFolderId);
  for (const child of children) {
    await copyFolderTree(folders, attachments, child.id, created.id, createFolder, duplicateAttachment);
  }
}
