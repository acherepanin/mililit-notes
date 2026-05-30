import type { NoteResponse } from '../notes/notes.types';

export interface NoteTemplateResponse {
  id: number;
  name: string;
  contentHtml: string;
  contentText: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentFolderResponse {
  id: number;
  parentId: number | null;
  name: string;
  position: number;
  createdAt: string;
}

export interface AttachmentResponse {
  id: number;
  noteId: number | null;
  noteName: string | null;
  folderId: number | null;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ExportResponse {
  exportedAt: string;
  notes: NoteResponse[];
  templates: NoteTemplateResponse[];
}

export interface ShareLinkResponse {
  id: number;
  noteId: number;
  url: string;
  expiresAt: string;
  includeSecrets: boolean;
  oneTime: boolean;
  accessCount: number;
  maxAccessCount: number | null;
  revokedAt: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
}

export interface PublicShareResponse {
  note: Pick<NoteResponse, 'id' | 'name' | 'contentHtml' | 'contentText' | 'updatedAt'>;
  expiresAt: string;
}
