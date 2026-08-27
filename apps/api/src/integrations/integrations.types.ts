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

export interface UpdateUserIntegrationInput {
  accessMode?: "read" | "write";
  allowSecrets?: boolean;
  dailyReadLimit?: number | null;
  dailyRequestLimit?: number | null;
  dailyWriteLimit?: number | null;
  enabled?: boolean;
  permissions?: Partial<IntegrationPermissions>;
}

export interface UpdateAdminIntegrationInput {
  accessToken?: string;
  allowSecrets?: boolean;
  botToken?: string;
  clearAccessToken?: boolean;
  clearBotToken?: boolean;
  clearSecret?: boolean;
  confirmationCode?: string | null;
  dailyReadLimit?: number | null;
  dailyRequestLimit?: number | null;
  dailyWriteLimit?: number | null;
  enabled?: boolean;
  groupId?: string | null;
  requireConfirmation?: boolean;
  secret?: string;
  webhookUrl?: string | null;
}
