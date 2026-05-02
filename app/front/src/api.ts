import type {
  ActivityLog,
  AdminStats,
  AdminUser,
  AuthUser,
  CreateAdminUserPayload,
  CreateNotePayload,
  LoginResponse,
  Note,
  NoteTreeNode,
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
  getStats: () => request<AdminStats>('/api/admin/stats'),
};
