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
  eventsLast24h: number;
  attachmentsTotal: number;
  attachmentsStorageBytes: number;
  orphanAttachmentsTotal: number;
  orphanAttachmentsBytes: number;
  averageAttachmentBytes: number;
  largestAttachmentBytes: number;
  notesWithAttachmentsTotal: number;
  noteVersionsTotal: number;
  shareLinksActiveTotal: number;
  aiEnabledUsersTotal: number;
  aiSelectedModelsTotal: number;
  aiProvidersTotal: number;
  aiSyncedModelsTotal: number;
  aiDeprecatedModelsTotal: number;
  aiChatsLast24h: number;
  aiToolExecutionsLast24h: number;
  aiActiveUsersLast24h: number;
  aiLastModelsSyncAt: string | null;
  activityRange: AdminStatsRange;
  activityByDay: AdminActivityDay[];
  topStorageUsers: AdminStorageUser[];
  topActivityUsers: AdminActivityUser[];
  topAiModels: AdminAiModelStat[];
  aiMonthlySpendUsers: AdminAiSpendUser[];
  fileTypes: AdminFileTypeStat[];
}

export type AdminStatsRange = 'day' | 'week' | 'month' | 'year';

export interface AdminActivityDay {
  date: string;
  total: number;
  login: number;
  notes: number;
  admin: number;
  ai: number;
}

export interface AdminStorageUser {
  username: string;
  filesTotal: number;
  storageBytes: number;
}

export interface AdminActivityUser {
  username: string;
  eventsTotal: number;
}

export interface AdminFileTypeStat {
  type: string;
  filesTotal: number;
  storageBytes: number;
}

export interface AdminAiModelStat {
  model: string;
  usersTotal: number;
}

export interface AdminAiSpendModel {
  providerName: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number | null;
}

export interface AdminAiSpendUser {
  userId: number;
  username: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  knownCostUsd: number;
  hasUnknownCost: boolean;
  models: AdminAiSpendModel[];
}
