export type AiModelTier = 'free' | 'paid' | 'unknown';
export type AiModelSignal = 'low' | 'medium' | 'high' | 'unknown';

export interface AiSettingsRow {
  user_id: number;
  enabled: 0 | 1;
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
  capabilities: string;
  is_deprecated: 0 | 1;
  provider_created_at: number | null;
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
  score: number;
  speedScore: number;
  valueScore: number;
  sortRank: number;
  capabilities: string[];
  isDeprecated: boolean;
}

export interface AiSettingsResponse {
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
  models: AiModelResponse[];
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string;
}

export interface AiChatResponse {
  message: AiChatMessage;
  actions?: AiToolAction[];
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
}
