import type {
  ActivityLog,
  AdminStats,
  AdminStatsRange,
  AdminUser,
  Attachment,
  AuthUser,
  CreateAdminUserPayload,
  CreateNotePayload,
  NoteSearchResult,
  NoteTemplate,
  NoteVersion,
  LoginResponse,
  Note,
  NoteTreeNode,
  PublicShare,
  ShareLink,
  Tag,
  UpdateAdminUserPayload,
  UpdateNotePayload,
  UserLanguage,
  UserTheme,
} from './types';

let authToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function setApiToken(token: string | null): void {
  authToken = token;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new ApiError(details || `Request failed with status ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

async function requestBlob(url: string, init?: RequestInit): Promise<Blob> {
  const response = await fetch(url, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new ApiError(details || `Request failed with status ${response.status}`, response.status);
  }

  return response.blob();
}

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  getMe: () => request<AuthUser>('/api/me'),
  updatePreferences: (payload: { language?: UserLanguage; theme?: UserTheme }) =>
    request<AuthUser>('/api/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export const notesApi = {
  getTree: () => request<NoteTreeNode[]>('/api/notes/tree'),
  listTrash: () => request<Note[]>('/api/notes/trash'),
  search: (query: string) =>
    request<NoteSearchResult[]>(`/api/notes/search?q=${encodeURIComponent(query)}`),
  reindexSearch: () =>
    request<{ indexed: number }>('/api/notes/search/reindex', { method: 'POST' }),
  listTags: () => request<Tag[]>('/api/notes/tags'),
  createTag: (name: string) =>
    request<Tag>('/api/notes/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteTag: (id: number) =>
    request<{ id: number }>(`/api/notes/tags/${id}`, {
      method: 'DELETE',
    }),
  updateTag: (id: number, name: string) =>
    request<Tag>(`/api/notes/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  getNote: (id: number) => request<Note>(`/api/notes/${id}`),
  createNote: (payload: CreateNotePayload) =>
    request<Note>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateNote: (id: number, payload: UpdateNotePayload) =>
    request<Note>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  moveNote: (id: number, parentId: number | null) =>
    request<Note>(`/api/notes/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId }),
    }),
  deleteNote: (id: number) =>
    request<{ id: number }>(`/api/notes/${id}`, {
      method: 'DELETE',
    }),
  restoreNote: (id: number) => request<Note>(`/api/notes/${id}/restore`, { method: 'POST' }),
  permanentDeleteNote: (id: number) =>
    request<{ id: number }>(`/api/notes/${id}/permanent`, { method: 'DELETE' }),
  listVersions: (id: number) => request<NoteVersion[]>(`/api/notes/${id}/versions`),
  restoreVersion: (id: number, versionId: number) =>
    request<Note>(`/api/notes/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  updateTags: (id: number, tags: string[]) =>
    request<Note>(`/api/notes/${id}/tags`, {
      method: 'PATCH',
      body: JSON.stringify({ tags }),
    }),
};

export const workspaceApi = {
  listTemplates: () => request<NoteTemplate[]>('/api/templates'),
  createTemplate: (payload: { name: string; contentHtml: string; contentText: string }) =>
    request<NoteTemplate>('/api/templates', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTemplate: (id: number) =>
    request<{ id: number }>(`/api/templates/${id}`, { method: 'DELETE' }),
  createNoteFromTemplate: (templateId: number, parentId: number | null) =>
    request<Note>('/api/notes/from-template', {
      method: 'POST',
      body: JSON.stringify({ templateId, parentId }),
    }),
  exportJson: () =>
    request<{ exportedAt: string; notes: Note[]; templates: NoteTemplate[] }>('/api/export/json'),
  importJson: (payload: { notes: Note[]; templates?: NoteTemplate[] }) =>
    request<{ imported: number }>('/api/import/json', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listAccountAttachments: () => request<Attachment[]>('/api/attachments'),
  uploadAttachment: (payload: {
    noteId?: number | null;
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  }) =>
    request<Attachment>(
      payload.noteId ? `/api/notes/${payload.noteId}/attachments` : '/api/attachments',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  attachAttachmentToNote: (id: number, noteId: number | null) =>
    request<Attachment>(`/api/attachments/${id}/note`, {
      method: 'PATCH',
      body: JSON.stringify({ noteId }),
    }),
  listAttachments: (noteId: number) => request<Attachment[]>(`/api/notes/${noteId}/attachments`),
  downloadAttachment: (id: number) => requestBlob(`/api/attachments/${id}/download`),
  downloadAttachmentsArchive: (noteId: number, ids: number[] = []) => {
    const params = ids.length ? `?ids=${ids.join(',')}` : '';
    return requestBlob(`/api/notes/${noteId}/attachments/archive${params}`);
  },
  downloadAccountAttachmentsArchive: (ids: number[] = []) => {
    const params = ids.length ? `?ids=${ids.join(',')}` : '';
    return requestBlob(`/api/attachments/archive${params}`);
  },
  renameAttachment: (id: number, fileName: string) =>
    request<Attachment>(`/api/attachments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fileName }),
    }),
  deleteAttachment: (id: number) =>
    request<{ id: number }>(`/api/attachments/${id}`, { method: 'DELETE' }),
  listShareLinks: (noteId: number) => request<ShareLink[]>(`/api/notes/${noteId}/share-links`),
  createShareLink: (noteId: number, payload: { ttlHours?: number; includeSecrets?: boolean }) =>
    request<ShareLink>(`/api/notes/${noteId}/share-links`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revokeShareLink: (id: number) =>
    request<{ id: number }>(`/api/share-links/${id}`, { method: 'DELETE' }),
};

export const publicApi = {
  getShare: (token: string) => request<PublicShare>(`/api/share/${encodeURIComponent(token)}`),
};

export const adminApi = {
  listUsers: () => request<AdminUser[]>('/api/admin/users'),
  createUser: (payload: CreateAdminUserPayload) =>
    request<AdminUser>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateUser: (id: number, payload: UpdateAdminUserPayload) =>
    request<AdminUser>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteUser: (id: number) =>
    request<{ id: number }>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    }),
  listActivity: () => request<ActivityLog[]>('/api/admin/activity?limit=80'),
  getStats: (range: AdminStatsRange = 'week') =>
    request<AdminStats>(`/api/admin/stats?range=${range}`),
};
