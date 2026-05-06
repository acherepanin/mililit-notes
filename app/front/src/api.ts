import type {
  ActivityLog,
  AdminStats,
  AdminStatsRange,
  AiChatMessage,
  AiChatResponse,
  AiBotAdminSettings,
  AiBotConnectionCheck,
  AiBotLinkCode,
  AiBotProvider,
  AiBotUserSettings,
  AiCurrentNoteContext,
  AiMonthlyUsage,
  AiSettings,
  AiToolAction,
  AiToolExecutionResponse,
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
  UpdateAiBotAdminSettingsPayload,
  UpdateAiBotUserSettingsPayload,
  UpdateAiSettingsPayload,
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

function parseApiErrorMessage(raw: string, status: number): string {
  if (!raw) {
    return `Request failed with status ${status}`;
  }

  try {
    const payload = JSON.parse(raw) as unknown;

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
    ) {
      return payload.message;
    }

    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      Array.isArray(payload.message)
    ) {
      return payload.message.filter((item) => typeof item === 'string').join(', ');
    }
  } catch {
    return raw;
  }

  return raw;
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
    throw new ApiError(parseApiErrorMessage(details, response.status), response.status);
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
    throw new ApiError(parseApiErrorMessage(details, response.status), response.status);
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
  createShareLink: (
    noteId: number,
    payload: { ttlHours?: number; includeSecrets?: boolean; oneTime?: boolean },
  ) =>
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

export const aiApi = {
  getSettings: () => request<AiSettings>('/api/ai/settings'),
  updateSettings: (payload: UpdateAiSettingsPayload) =>
    request<AiSettings>('/api/ai/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  syncModels: () => request<AiSettings>('/api/ai/models/sync', { method: 'POST' }),
  testConnection: () =>
    request<{ ok: boolean; checkedAt: string }>('/api/ai/test-connection', { method: 'POST' }),
  getMonthlyUsage: () => request<AiMonthlyUsage>('/api/ai/usage/monthly'),
  chat: (
    message: string,
    history: AiChatMessage[],
    currentNote?: AiCurrentNoteContext | null,
    signal?: AbortSignal,
  ) =>
    request<AiChatResponse>('/api/ai/chat', {
      method: 'POST',
      signal,
      body: JSON.stringify({ message, history, currentNote }),
    }),
  executeAction: (action: AiToolAction) =>
    request<AiToolExecutionResponse>('/api/ai/actions/execute', {
      method: 'POST',
      body: JSON.stringify({ name: action.name, payload: action.payload }),
    }),
  listBotAdminSettings: () => request<AiBotAdminSettings[]>('/api/ai/bots/admin-settings'),
  updateBotAdminSettings: (provider: AiBotProvider, payload: UpdateAiBotAdminSettingsPayload) =>
    request<AiBotAdminSettings>(`/api/ai/bots/admin-settings/${provider}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  testBotAdminConnection: (provider: AiBotProvider) =>
    request<AiBotConnectionCheck>(`/api/ai/bots/admin-settings/${provider}/test`, {
      method: 'POST',
    }),
  listBotUserSettings: () => request<AiBotUserSettings[]>('/api/ai/bots/me'),
  updateBotUserSettings: (provider: AiBotProvider, payload: UpdateAiBotUserSettingsPayload) =>
    request<AiBotUserSettings>(`/api/ai/bots/me/${provider}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createBotLinkCode: (provider: AiBotProvider) =>
    request<AiBotLinkCode>('/api/ai/bots/link-code', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }),
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
