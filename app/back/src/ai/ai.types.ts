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

export interface AiSettingsRow {
  user_id: number;
  enabled: 0 | 1;
  allow_read_secrets: 0 | 1;
  require_action_confirmation: 0 | 1;
  daily_request_limit: number | null;
  daily_token_limit: number | null;
  provider_name: string;
  base_url: string;
  model: string | null;
  api_key_encrypted: string | null;
  api_key_hint: string | null;
  api_key_updated_at: string | null;
  last_connection_check_at: string | null;
  last_connection_check_status: string | null;
  last_models_sync_at: string | null;
  models_sync_status: string | null;
  models_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiProviderSettingsRow {
  id: number;
  user_id: number;
  provider_name: string;
  base_url: string;
  model: string | null;
  api_key_encrypted: string | null;
  api_key_hint: string | null;
  api_key_updated_at: string | null;
  last_connection_check_at: string | null;
  last_connection_check_status: string | null;
  last_models_sync_at: string | null;
  models_sync_status: string | null;
  models_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiModelRow {
  id: number;
  user_id: number;
  provider_name: string;
  model_id: string;
  label: string;
  tier: AiModelTier;
  quality: AiModelSignal;
  speed: AiModelSignal;
  cost: AiModelSignal;
  input_price_per_1m: number | null;
  cached_input_price_per_1m: number | null;
  output_price_per_1m: number | null;
  capabilities: string;
  is_deprecated: 0 | 1;
  provider_created_at: number | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface AiModelCatalogRow {
  model_id: string;
  label: string | null;
  tier: AiModelTier;
  quality: AiModelSignal;
  speed: AiModelSignal;
  cost: AiModelSignal;
  score: number;
  speed_score: number;
  value_score: number;
  sort_rank: number;
  input_price_per_1m: number | null;
  cached_input_price_per_1m: number | null;
  output_price_per_1m: number | null;
  capabilities: string;
  is_deprecated: 0 | 1;
  source: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface AiModelResponse {
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

export interface AiSettingsResponse {
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
  models: AiModelResponse[];
  providers: AiSavedProviderResponse[];
}

export interface AiMonthlyUsageModelResponse {
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

export interface AiMonthlyUsageResponse {
  monthStart: string;
  monthEnd: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  knownCostUsd: number;
  hasUnknownCost: boolean;
  models: AiMonthlyUsageModelResponse[];
}

export interface AiUsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
}

export interface AiSavedProviderResponse {
  providerName: string;
  baseUrl: string;
  model: string | null;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  apiKeyUpdatedAt: string | null;
  updatedAt: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string;
}

export interface AiChatResponse {
  message: AiChatMessage;
  actions?: AiToolAction[];
  executions?: AiToolExecutionResponse[];
  toolCalls?: AiToolCallUsage[];
}

export interface AiToolCallUsage {
  name: string;
  mode: 'readonly' | 'mutation';
}

export interface AiToolAction {
  name: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  destructive?: boolean;
}

export interface AiToolExecutionResponse {
  message: AiChatMessage;
  actionName?: string;
  noteId?: number;
  refreshTree?: boolean;
}

export interface OpenAiCompatibleModel {
  id?: unknown;
  object?: unknown;
  created?: unknown;
}

export interface OpenAiCompatibleModelsResponse {
  data?: OpenAiCompatibleModel[];
}

export interface OpenAiCompatibleChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        type?: unknown;
        function?: {
          name?: unknown;
          arguments?: unknown;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

export interface OpenAiCompatibleTranscriptionResponse {
  text?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
  };
}

export interface AiBotAdminSettingsRow {
  provider: AiBotProvider;
  enabled: 0 | 1;
  webhook_url: string | null;
  bot_token_encrypted: string | null;
  access_token_encrypted: string | null;
  secret_encrypted: string | null;
  group_id: string | null;
  confirmation_code: string | null;
  allow_secrets: 0 | 1;
  require_confirmation: 0 | 1;
  daily_request_limit: number | null;
  daily_read_limit: number | null;
  daily_write_limit: number | null;
  last_check_at: string | null;
  last_check_status: string | null;
  last_check_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiBotUserSettingsRow {
  id: number;
  user_id: number;
  provider: AiBotProvider;
  enabled: 0 | 1;
  access_mode: AiBotAccessMode;
  allow_secrets: 0 | 1;
  allow_note_read: 0 | 1;
  allow_note_write: 0 | 1;
  allow_note_delete: 0 | 1;
  allow_tags: 0 | 1;
  allow_templates: 0 | 1;
  allow_versions: 0 | 1;
  allow_attachments: 0 | 1;
  allow_share_links: 0 | 1;
  daily_request_limit: number | null;
  daily_read_limit: number | null;
  daily_write_limit: number | null;
  linked_external_id: string | null;
  linked_username: string | null;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiBotAdminSettingsResponse {
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

export interface AiBotUserSettingsResponse {
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

export interface AiBotConnectionCheckResponse {
  ok: boolean;
  checkedAt: string;
  message: string;
}

export interface AiBotLinkCodeResponse {
  provider: AiBotProvider;
  code: string;
  expiresAt: string;
}
