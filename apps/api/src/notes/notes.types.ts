export interface NoteResponse {
  attachmentFolderId: number | null;
  contentHtml: string;
  contentText: string;
  createdAt: string;
  deletedAt: string | null;
  id: number;
  isFavorite: boolean;
  isPinned: boolean;
  name: string;
  parentId: number | null;
  position: number;
  revision: number;
  tags: string[];
  updatedAt: string;
  userId: number;
}

export interface NoteTreeNode {
  children: NoteTreeNode[];
  id: number;
  isFavorite: boolean;
  isPinned: boolean;
  name: string;
  parentId: number | null;
  position: number;
  revision: number;
  tags: string[];
  updatedAt: string;
}

export interface NoteVersionResponse {
  contentHtml: string;
  contentText: string;
  createdAt: string;
  id: number;
  name: string;
  noteId: number;
}

export interface NoteSearchResult {
  id: number;
  name: string;
  snippet: string;
  tags: string[];
  updatedAt: string;
}

export interface TagResponse {
  color: string | null;
  id: number;
  name: string;
}

export interface CreateNoteInput {
  name: string;
  parentId: number | null;
}

export interface UpdateNoteInput {
  attachmentFolderId?: number | null;
  contentHtml?: string;
  contentText?: string;
  isFavorite?: boolean;
  isPinned?: boolean;
  name?: string;
  revision: number;
}

export interface MoveNoteInput {
  parentId: number | null;
  position?: number;
  revision: number;
}

export interface SetTagsInput {
  revision: number;
  tags: string[];
}
