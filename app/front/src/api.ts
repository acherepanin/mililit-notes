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
  AttachmentFolder,
  AuthUser,
  MeUser,
  MonitoringPerformance,
  MonitoringRange,
  PlanEntitlements,
  RequestErrorLog,
  SubscriptionLog,
  SubscriptionOrder,
  SubscriptionPlan,
  UserSubscription,
  CreateAdminUserPayload,
  CreateNotePayload,
  NoteTemplate,
  NoteVersion,
  LoginResponse,
  RegistrationPendingResponse,
  RegistrationPendingStatus,
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
    readonly code?: string,
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

    if (typeof payload === 'object' && payload !== null) {
      if ('message' in payload && typeof payload.message === 'string') {
        return payload.message;
      }
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

function parseApiErrorCode(raw: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const payload = JSON.parse(raw) as unknown;
    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const code = payload.code;
      return typeof code === 'string' ? code : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
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
    throw new ApiError(
      parseApiErrorMessage(details, response.status),
      response.status,
      parseApiErrorCode(details),
    );
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
  register: (payload: {
    username: string;
    password: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }) =>
    request<RegistrationPendingResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getRegistrationPendingStatus: (pendingId: number) =>
    request<{ status: RegistrationPendingStatus }>(`/api/auth/register/pending/${pendingId}`),
  verifyEmail: (token: string) =>
    request<{ ok: true }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),
  getMe: () => request<MeUser>('/api/me'),
  updatePreferences: (payload: { language?: UserLanguage; theme?: UserTheme }) =>
    request<MeUser>('/api/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateProfile: (payload: {
    firstName?: string | null;
    lastName?: string | null;
    patronymic?: string | null;
    birthDate?: string | null;
  }) =>
    request<MeUser>('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

export const subscriptionApi = {
  listPlans: () => request<SubscriptionPlan[]>('/api/subscription-plans'),
  checkout: (payload: {
    planId: number;
    termMonths?: number;
    mode?: 'purchase' | 'renew';
  }) =>
    request<SubscriptionOrder>('/api/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  confirmCheckout: (orderId: number) =>
    request<UserSubscription>(`/api/subscription/checkout/${orderId}/confirm`, {
      method: 'POST',
    }),
};

export const notesApi = {
  getTree: () => request<NoteTreeNode[]>('/api/notes/tree'),
  listTrash: () => request<Note[]>('/api/notes/trash'),
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
  listAccountAttachments: (folderId?: number | null) => {
    const params =
      folderId === undefined
        ? ''
        : folderId === null
          ? '?folderId=root'
          : `?folderId=${folderId}`;
    return request<Attachment[]>(`/api/attachments${params}`);
  },
  listAttachmentFolders: () => request<AttachmentFolder[]>('/api/attachment-folders'),
  createAttachmentFolder: (payload: { name: string; parentId?: number | null }) =>
    request<AttachmentFolder>('/api/attachment-folders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  renameAttachmentFolder: (id: number, name: string) =>
    request<AttachmentFolder>(`/api/attachment-folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteAttachmentFolder: (id: number) =>
    request<{ id: number }>(`/api/attachment-folders/${id}`, { method: 'DELETE' }),
  moveAttachmentFolderParent: (id: number, parentId: number | null) =>
    request<AttachmentFolder>(`/api/attachment-folders/${id}/parent`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId }),
    }),
  duplicateAttachment: (id: number, folderId?: number | null) =>
    request<Attachment>(`/api/attachments/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ folderId: folderId ?? null }),
    }),
  moveAttachmentToFolder: (id: number, folderId: number | null) =>
    request<Attachment>(`/api/attachments/${id}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    }),
  uploadAttachment: (payload: {
    noteId?: number | null;
    folderId?: number | null;
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
  downloadAccountAttachmentsArchive: (ids: number[] = [], folderIds: number[] = []) => {
    const searchParams = new URLSearchParams();
    if (ids.length) {
      searchParams.set('ids', ids.join(','));
    }
    if (folderIds.length) {
      searchParams.set('folderIds', folderIds.join(','));
    }
    const query = searchParams.toString();
    return requestBlob(`/api/attachments/archive${query ? `?${query}` : ''}`);
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
  listMonitoringActions: () => request<ActivityLog[]>('/api/admin/monitoring/actions?limit=100'),
  listMonitoringSubscriptions: () =>
    request<SubscriptionLog[]>('/api/admin/monitoring/subscriptions?limit=100'),
  listMonitoringErrors: () =>
    request<RequestErrorLog[]>('/api/admin/monitoring/errors?limit=100'),
  getMonitoringPerformance: (range: MonitoringRange = 'day') =>
    request<MonitoringPerformance>(`/api/admin/monitoring/performance?range=${range}`),
  getStats: (range: AdminStatsRange = 'week') =>
    request<AdminStats>(`/api/admin/stats?range=${range}`),
  listSubscriptionPlans: () => request<SubscriptionPlan[]>('/api/admin/subscription-plans'),
  createSubscriptionPlan: (payload: {
    slug: string;
    name: string;
    description?: string;
    priceCents: number;
    currency?: string;
    billingPeriod: SubscriptionPlan['billingPeriod'];
    entitlements: PlanEntitlements;
    iconKey?: string;
    cardColor?: string;
    cardArt?: string;
    isActive?: boolean;
    isHidden?: boolean;
    sortOrder?: number;
  }) =>
    request<SubscriptionPlan>('/api/admin/subscription-plans', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSubscriptionPlan: (
    id: number,
    payload: Partial<{
      slug: string;
      name: string;
      description: string | null;
      priceCents: number;
      currency: string;
      billingPeriod: SubscriptionPlan['billingPeriod'];
      entitlements: PlanEntitlements;
      iconKey: string;
      cardColor: string;
      cardArt: string;
      isActive: boolean;
      isHidden: boolean;
      sortOrder: number;
    }>,
  ) =>
    request<SubscriptionPlan>(`/api/admin/subscription-plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSubscriptionPlan: (id: number) =>
    request<{ id: number }>(`/api/admin/subscription-plans/${id}`, { method: 'DELETE' }),
  assignUserSubscription: (userId: number, planId: number) =>
    request<UserSubscription>(`/api/admin/subscription-plans/assign/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),
};
