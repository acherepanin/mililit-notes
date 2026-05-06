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
  oneTime: boolean;
  accessCount: number;
  maxAccessCount: number | null;
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
export type AiBotProvider = 'telegram' | 'vk';
export type AiBotAccessMode = 'read' | 'write';

export interface AiBotPermissions {
  readNotes: boolean;
  writeNotes: boolean;
  deleteNotes: boolean;
  manageTags: boolean;
  useTemplates: boolean;
  useVersions: boolean;
  listAttachments: boolean;
  createShareLinks: boolean;
}

export interface AiModel {
  id: string;
  label: string;
  tier: AiModelTier;
  quality: AiModelSignal;
  speed: AiModelSignal;
  cost: AiModelSignal;
  inputPricePer1M: number | null;
  cachedInputPricePer1M: number | null;
  outputPricePer1M: number | null;
  score: number;
  speedScore: number;
  valueScore: number;
  sortRank: number;
  capabilities: string[];
  isDeprecated: boolean;
}

export interface AiSettings {
  enabled: boolean;
  allowReadSecrets: boolean;
  requireActionConfirmation: boolean;
  dailyRequestLimit: number | null;
  dailyTokenLimit: number | null;
  usageToday: AiUsageSummary;
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
  providers: AiSavedProvider[];
}

export interface AiUsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
}

export interface AiMonthlyUsageModel {
  providerName: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number | null;
  inputPricePer1M: number | null;
  cachedInputPricePer1M: number | null;
  outputPricePer1M: number | null;
}

export interface AiMonthlyUsage {
  monthStart: string;
  monthEnd: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  knownCostUsd: number;
  hasUnknownCost: boolean;
  models: AiMonthlyUsageModel[];
}

export interface AiSavedProvider {
  providerName: string;
  baseUrl: string;
  model: string | null;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  apiKeyUpdatedAt: string | null;
  updatedAt: string;
}

export interface UpdateAiSettingsPayload {
  enabled?: boolean;
  allowReadSecrets?: boolean;
  requireActionConfirmation?: boolean;
  dailyRequestLimit?: number | null;
  dailyTokenLimit?: number | null;
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
  executions?: AiToolExecutionResponse[];
}

export interface AiCurrentNoteContext {
  id: number;
  name: string;
  contentHtml: string;
  contentText: string;
}

export interface AiToolExecutionResponse {
  message: AiChatMessage;
  actionName?: string;
  noteId?: number;
  refreshTree?: boolean;
}

export interface AiBotAdminSettings {
  provider: AiBotProvider;
  enabled: boolean;
  webhookUrl: string | null;
  hasBotToken: boolean;
  botTokenHint: string | null;
  hasAccessToken: boolean;
  accessTokenHint: string | null;
  hasSecret: boolean;
  secretHint: string | null;
  groupId: string | null;
  confirmationCode: string | null;
  allowSecrets: boolean;
  requireConfirmation: boolean;
  dailyRequestLimit: number | null;
  dailyReadLimit: number | null;
  dailyWriteLimit: number | null;
  lastCheckAt: string | null;
  lastCheckStatus: string | null;
  lastCheckError: string | null;
  updatedAt: string;
}

export interface UpdateAiBotAdminSettingsPayload {
  enabled?: boolean;
  webhookUrl?: string | null;
  botToken?: string;
  clearBotToken?: boolean;
  accessToken?: string;
  clearAccessToken?: boolean;
  secret?: string;
  clearSecret?: boolean;
  groupId?: string | null;
  confirmationCode?: string | null;
  allowSecrets?: boolean;
  requireConfirmation?: boolean;
  dailyRequestLimit?: number | null;
  dailyReadLimit?: number | null;
  dailyWriteLimit?: number | null;
}

export interface AiBotConnectionCheck {
  ok: boolean;
  checkedAt: string;
  message: string;
}

export interface AiBotUserSettings {
  provider: AiBotProvider;
  enabled: boolean;
  accessMode: AiBotAccessMode;
  allowSecrets: boolean;
  permissions: AiBotPermissions;
  dailyRequestLimit: number | null;
  dailyReadLimit: number | null;
  dailyWriteLimit: number | null;
  linkedExternalId: string | null;
  linkedUsername: string | null;
  linkedAt: string | null;
}

export interface UpdateAiBotUserSettingsPayload {
  enabled?: boolean;
  accessMode?: AiBotAccessMode;
  allowSecrets?: boolean;
  permissions?: Partial<AiBotPermissions>;
  dailyRequestLimit?: number | null;
  dailyReadLimit?: number | null;
  dailyWriteLimit?: number | null;
}

export interface AiBotLinkCode {
  provider: AiBotProvider;
  code: string;
  expiresAt: string;
}
