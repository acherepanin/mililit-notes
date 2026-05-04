export interface NoteTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  isFavorite: boolean;
  isPinned: boolean;
  tags: string[];
  children: NoteTreeNode[];
}

export interface Note {
  id: number;
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

export interface CreateNotePayload {
  name: string;
  parentId?: number | null;
}

export interface UpdateNotePayload {
  name?: string;
  contentHtml?: string;
  contentText?: string;
  isFavorite?: boolean;
  isPinned?: boolean;
}

export type SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';
export type UserLanguage = 'ru' | 'en';
export type UserTheme = 'light' | 'dark';
export type UserRole = 'user' | 'admin';
export type NoteTreeFilter = { kind: 'all' } | { kind: 'favorite' } | { kind: 'tag'; tag: string };

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

export interface NoteVersion {
  id: number;
  noteId: number;
  name: string;
  contentHtml: string;
  contentText: string;
  createdAt: string;
}

export interface Tag {
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

export interface NoteTemplate {
  id: number;
  name: string;
  contentHtml: string;
  contentText: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: number;
  noteId: number | null;
  noteName: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ShareLink {
  id: number;
  noteId: number;
  url: string;
  expiresAt: string;
  includeSecrets: boolean;
  revokedAt: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
}

export interface PublicShare {
  note: Pick<Note, 'id' | 'name' | 'contentHtml' | 'contentText' | 'updatedAt'>;
  expiresAt: string;
}

export type AiModelTier = 'free' | 'paid' | 'unknown';
export type AiModelSignal = 'low' | 'medium' | 'high' | 'unknown';

export interface AiModel {
  id: string;
  label: string;
  tier: AiModelTier;
  quality: AiModelSignal;
  speed: AiModelSignal;
  cost: AiModelSignal;
  score: number;
  speedScore: number;
  valueScore: number;
  sortRank: number;
  capabilities: string[];
  isDeprecated: boolean;
}

export interface AiSettings {
  enabled: boolean;
  providerName: string;
  baseUrl: string;
  model: string | null;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  apiKeyUpdatedAt: string | null;
  lastConnectionCheckAt: string | null;
  lastConnectionCheckStatus: string | null;
  lastModelsSyncAt: string | null;
  modelsSyncStatus: string | null;
  modelsSyncError: string | null;
  models: AiModel[];
}

export interface UpdateAiSettingsPayload {
  enabled?: boolean;
  providerName?: string;
  baseUrl?: string;
  model?: string | null;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: AiToolAction[];
}

export interface AiToolAction {
  name: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  destructive?: boolean;
}

export interface AiChatResponse {
  message: AiChatMessage;
  actions?: AiToolAction[];
}

export interface AiCurrentNoteContext {
  id: number;
  name: string;
  contentHtml: string;
  contentText: string;
}

export interface AiToolExecutionResponse {
  message: AiChatMessage;
  noteId?: number;
  refreshTree?: boolean;
}
