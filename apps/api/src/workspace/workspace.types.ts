export interface TemplateInput {
  contentHtml: string;
  contentText: string;
  name: string;
}

export interface TemplateResponse extends TemplateInput {
  createdAt: string;
  id: number;
  isSystem: boolean;
  updatedAt: string;
}

export interface ImportNote {
  contentHtml: string;
  contentText: string;
  id: number;
  isFavorite: boolean;
  isPinned: boolean;
  name: string;
  parentId: number | null;
  position: number;
  tags: string[];
}

export interface ImportPayload {
  notes: ImportNote[];
  templates: TemplateInput[];
}

export interface ExportPayload extends ImportPayload {
  exportedAt: string;
  formatVersion: 1;
}

export interface ImportResponse {
  importedNotes: number;
  importedTemplates: number;
}

export interface CreateShareInput {
  includeSecrets: boolean;
  oneTime: boolean;
  ttlHours: number;
}

export interface ShareLinkResponse {
  accessCount: number;
  createdAt: string;
  expiresAt: string;
  id: number;
  includeSecrets: boolean;
  lastAccessedAt: string | null;
  maxAccessCount: number | null;
  noteId: number;
  oneTime: boolean;
  revokedAt: string | null;
  url: string;
}

export interface PublicShareResponse {
  expiresAt: string;
  note: {
    contentHtml: string;
    contentText: string;
    id: number;
    name: string;
    updatedAt: string;
  };
}
