export type AiModelRole =
  | "fast"
  | "chat"
  | "reasoning"
  | "vision"
  | "voice"
  | "transcription"
  | "speech"
  | "embedding";

export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type AiPromptModelRole = Extract<
  AiModelRole,
  "fast" | "chat" | "reasoning" | "vision" | "voice"
>;

export type JsonObject = Record<string, unknown>;

export type AiConversationStatus = "active" | "archived";

export interface CreateConversationInput {
  modelRole: AiPromptModelRole;
  title: string | null;
}

export interface UpdateConversationInput {
  modelRole?: AiPromptModelRole;
  status?: AiConversationStatus;
  title?: string | null;
}

export interface ConversationCursor {
  id: number;
  updatedAt: Date;
}

export interface ConversationListInput {
  cursor: ConversationCursor | null;
  limit: number;
  status: AiConversationStatus;
}

export type ComposerPartInput =
  { text: string; type: "text" } | { fileId: number; type: "file" | "image" };

export interface CreateMessageInput {
  context: {
    fileIds: number[];
    includeSecrets: boolean;
    noteIds: number[];
  };
  parts: ComposerPartInput[];
}

export interface CreateResponseInput extends CreateMessageInput {
  model?: string | null;
  promptKey: string;
}

export interface MessageListInput {
  beforeSequence: number | null;
  limit: number;
}

export interface CreateProviderInput {
  apiKey?: string;
  baseUrl: string;
  model: string | null;
  providerName: string;
}

export interface UpdateProviderInput {
  apiKey?: string;
  baseUrl?: string;
  clearApiKey?: true;
  model?: string | null;
  providerName?: string;
}

export interface ModelRouteInput {
  enabled: boolean;
  fallbackModels: string[];
  maxOutputTokens: number | null;
  model: string;
  providerSettingId: number | null;
  reasoningEffort: AiReasoningEffort;
  temperature: number | null;
}

export interface CreatePromptDefinitionInput {
  description: string | null;
  name: string;
  promptKey: string;
  securityPolicyKey: string;
}

export interface CreatePromptVersionInput {
  approvalPolicy: JsonObject;
  changeSummary: string | null;
  content: string;
  inputSchema: JsonObject;
  modelRole: AiPromptModelRole;
  outputSchema: JsonObject;
  reasoningEffort: AiReasoningEffort;
  retryLimit: number;
  stopConditions: JsonObject;
  toolAllowlist: string[];
}

export interface PromptEvalThresholds {
  maxCostUsd: number;
  maxLatencyMs: number;
  minQuality: number;
  requireAuthorization: boolean;
  requireSchema: boolean;
}

export interface CreatePromptEvalCaseInput {
  caseKey: string;
  expected: JsonObject;
  input: JsonObject;
  name: string;
  thresholds: PromptEvalThresholds;
}

export interface PromptEvalResultInput {
  authorizationPassed: boolean;
  caseId: number;
  costUsd: number;
  error: string | null;
  latencyMs: number;
  quality: number;
  schemaValid: boolean;
}

export interface RecordPromptEvalRunInput {
  evaluator: string;
  results: PromptEvalResultInput[];
}

export interface VoiceSpeechInput {
  text: string;
  voice: string;
}
