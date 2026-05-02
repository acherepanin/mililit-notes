export interface NoteTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  children: NoteTreeNode[];
}

export interface Note {
  id: number;
  name: string;
  contentHtml: string;
  contentText: string;
  parentId: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotePayload {
  name: string;
  parentId?: number | null;
}

export interface UpdateNotePayload {
  name?: string;
  contentHtml?: string;
  contentText?: string;
}

export type SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
export type UserLanguage = 'ru' | 'en';
export type UserTheme = 'light' | 'dark';
export type UserRole = 'user' | 'admin';

export interface NoteDraft {
  name: string;
  contentHtml: string;
  contentText: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  language: UserLanguage;
  theme: UserTheme;
  lastLoginAt: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface AdminUser {
  id: number;
  username: string;
  role: UserRole;
  language: UserLanguage;
  theme: UserTheme;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  notesCount: number;
}

export interface CreateAdminUserPayload {
  username: string;
  password: string;
  role?: UserRole;
  language?: UserLanguage;
  theme?: UserTheme;
}

export interface UpdateAdminUserPayload {
  password?: string;
  role?: UserRole;
}

export interface ActivityLog {
  id: number;
  actorId: number | null;
  actorUsername: string | null;
  userId: number | null;
  userUsername: string | null;
  action: string;
  targetType: string;
  targetId: number | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdminStats {
  usersTotal: number;
  adminsTotal: number;
  notesTotal: number;
  activityTotal: number;
  lastLoginAt: string | null;
  activeUsersToday: number;
}
