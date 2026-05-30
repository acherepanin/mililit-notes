export type UserLanguage = 'ru' | 'en';
export const USER_THEME_VALUES = ['dark', 'light', 'aurora', 'ember', 'ocean'] as const;

export type UserTheme = (typeof USER_THEME_VALUES)[number];
export type UserRole = 'user' | 'admin';

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  language: UserLanguage;
  theme: UserTheme;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  language: UserLanguage;
  theme: UserTheme;
  lastLoginAt: string | null;
}

export interface TokenPayload {
  sub: number;
  username: string;
  role: UserRole;
  exp: number;
}
