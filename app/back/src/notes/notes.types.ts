export interface NoteRecord {
  id: number;
  user_id: number;
  name: string;
  content_html: string;
  content_text: string;
  parent_id: number | null;
  position: number;
  is_favorite: 0 | 1;
  is_pinned: 0 | 1;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteResponse {
  id: number;
  userId: number;
  name: string;
  contentHtml: string;
  contentText: string;
  parentId: number | null;
  position: number;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
  children: NoteTreeNode[];
}

export interface NoteVersionRecord {
  id: number;
  note_id: number;
  user_id: number;
  name: string;
  content_html: string;
  content_text: string;
  created_at: string;
}

export interface NoteVersionResponse {
  id: number;
  noteId: number;
  name: string;
  contentHtml: string;
  contentText: string;
  createdAt: string;
}

export interface TagResponse {
  id: number;
  name: string;
  color: string | null;
}

export interface NoteSearchResult {
  id: number;
  name: string;
  snippet: string;
  tags: string[];
  updatedAt: string;
}
