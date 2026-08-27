import { requestApi } from "./notes-api";

export type IntegrationProvider = "telegram" | "vk";

export interface IntegrationPermissions {
  createShareLinks: boolean;
  deleteNotes: boolean;
  listAttachments: boolean;
  manageTags: boolean;
  readNotes: boolean;
  useTemplates: boolean;
  useVersions: boolean;
  writeNotes: boolean;
}

export interface UserIntegration {
  accessMode: "read" | "write";
  allowSecrets: boolean;
  available: boolean;
  dailyReadLimit: number | null;
  dailyRequestLimit: number | null;
  dailyWriteLimit: number | null;
  enabled: boolean;
  linkedAt: string | null;
  linkedExternalId: string | null;
  linkedUsername: string | null;
  permissions: IntegrationPermissions;
  provider: IntegrationProvider;
  updatedAt: string;
}

export interface AdminIntegration {
  accessTokenHint: string | null;
  allowSecrets: boolean;
  botTokenHint: string | null;
  confirmationCode: string | null;
  dailyReadLimit: number | null;
  dailyRequestLimit: number | null;
  dailyWriteLimit: number | null;
  enabled: boolean;
  groupId: string | null;
  hasAccessToken: boolean;
  hasBotToken: boolean;
  hasSecret: boolean;
  lastCheckAt: string | null;
  lastCheckError: string | null;
  lastCheckStatus: string | null;
  provider: IntegrationProvider;
  requireConfirmation: boolean;
  secretHint: string | null;
  updatedAt: string;
  webhookUrl: string | null;
}

export const integrationsApi = {
  createLinkCode(provider: IntegrationProvider) {
    return requestApi<{ code: string; expiresAt: string }>(
      `/integrations/${provider}/link-codes`,
      { method: "POST" },
    );
  },
  listAdmin() {
    return requestApi<AdminIntegration[]>("/admin/integrations");
  },
  listUser() {
    return requestApi<UserIntegration[]>("/integrations");
  },
  test(provider: IntegrationProvider) {
    return requestApi<{
      checkedAt: string;
      error?: string;
      identity?: string;
      status: "failed" | "ok";
    }>(`/admin/integrations/${provider}/test`, { method: "POST" });
  },
  unlink(provider: IntegrationProvider) {
    return requestApi<UserIntegration>(`/integrations/${provider}/link`, {
      method: "DELETE",
    });
  },
  updateAdmin(provider: IntegrationProvider, input: Record<string, unknown>) {
    return requestApi<AdminIntegration>(`/admin/integrations/${provider}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
  },
  updateUser(provider: IntegrationProvider, input: Record<string, unknown>) {
    return requestApi<UserIntegration>(`/integrations/${provider}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
  },
};
