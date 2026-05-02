import type { UserLanguage, UserRole, UserTheme } from '../auth/auth.types';

export interface AdminUserRecord {
  id: number;
  username: string;
  role: UserRole;
  language: UserLanguage;
  theme: UserTheme;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  notes_count: number;
}

export interface AdminUserResponse {
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

export interface AdminStatsResponse {
  usersTotal: number;
  adminsTotal: number;
  notesTotal: number;
  activityTotal: number;
  lastLoginAt: string | null;
  activeUsersToday: number;
}
