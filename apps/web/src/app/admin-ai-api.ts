import { requestApi } from "./notes-api";

export type AiModelRole =
  | "fast"
  | "chat"
  | "reasoning"
  | "vision"
  | "voice"
  | "transcription"
  | "speech"
  | "embedding";
export type AiPromptModelRole = Extract<
  AiModelRole,
  "fast" | "chat" | "reasoning" | "vision" | "voice"
>;
export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type JsonValue =
  boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface AiProvider {
  apiKeyHint: string | null;
  apiKeyUpdatedAt: string | null;
  baseUrl: string;
  hasApiKey: boolean;
  id: number;
  lastConnectionCheckAt: string | null;
  lastConnectionCheckStatus: string | null;
  lastModelsSyncAt: string | null;
  model: string | null;
  modelsSyncError: string | null;
  modelsSyncStatus: string | null;
  providerName: string;
  updatedAt: string;
}

export interface AiProviderModel {
  capabilities: string[];
  cachedInputPricePer1m: number | null;
  cost: string;
  id: string;
  inputPricePer1m: number | null;
  label: string;
  outputPricePer1m: number | null;
  providerCreatedAt: string | null;
  quality: string;
  speed: string;
  tier: string;
}

export interface AiUsageSummary {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  totalCostUsd: number;
}

export interface AiModelRoute {
  enabled: boolean;
  fallbackModels: string[];
  id: number;
  maxOutputTokens: number | null;
  model: string;
  providerSettingId: number | null;
  reasoningEffort: AiReasoningEffort;
  role: AiModelRole;
  temperature: number | null;
  updatedAt: string;
}

export interface PromptVersion {
  activatedAt: string | null;
  approvalPolicy: JsonObject;
  changeSummary: string | null;
  content: string;
  createdAt: string;
  id: number;
  inputSchema: JsonObject;
  modelRole: AiPromptModelRole;
  outputSchema: JsonObject;
  reasoningEffort: AiReasoningEffort;
  retryLimit: number;
  status: "active" | "archived" | "draft" | "review";
  stopConditions: JsonObject;
  toolAllowlist: string[];
  version: number;
}

export interface PromptDefinition {
  createdAt: string;
  description: string | null;
  enabled: boolean;
  id: number;
  name: string;
  origin: "admin" | "system";
  promptKey: string;
  securityPolicyKey: string;
  updatedAt: string;
  versions: PromptVersion[];
}

export interface PromptEvalThresholds {
  maxCostUsd: number;
  maxLatencyMs: number;
  minQuality: number;
  requireAuthorization: boolean;
  requireSchema: boolean;
}

export interface PromptEvalState {
  cases: Array<{
    caseKey: string;
    createdAt: string;
    enabled: boolean;
    expected: JsonObject;
    id: number;
    input: JsonObject;
    name: string;
    revision: number;
    thresholds: PromptEvalThresholds;
    updatedAt: string;
  }>;
  runs: Array<{
    completedAt: string;
    evaluator: string;
    id: number;
    metrics: JsonObject;
    results: JsonObject[];
    status: "error" | "failed" | "passed";
    suiteHash: string;
    version?: number;
  }>;
}

export interface ProviderInput {
  apiKey?: string;
  baseUrl: string;
  model: string | null;
  providerName: string;
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

export interface PromptVersionInput {
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

function json(input: unknown): RequestInit {
  return { body: JSON.stringify(input), method: "POST" };
}

export const adminAiApi = {
  activateVersion(definitionId: number, version: number) {
    return requestApi<PromptDefinition[]>(
      `/admin/ai/prompts/${definitionId}/versions/${version}/activate`,
      { method: "POST" },
    );
  },
  createEvalCase(
    definitionId: number,
    input: {
      caseKey: string;
      expected: JsonObject;
      input: JsonObject;
      name: string;
      thresholds: PromptEvalThresholds;
    },
  ) {
    return requestApi<PromptEvalState>(
      `/admin/ai/prompts/${definitionId}/eval-cases`,
      json(input),
    );
  },
  createPrompt(input: {
    description: string | null;
    name: string;
    promptKey: string;
    securityPolicyKey: string;
  }) {
    return requestApi<PromptDefinition[]>("/admin/ai/prompts", json(input));
  },
  createProvider(input: ProviderInput) {
    return requestApi<AiProvider>("/ai/providers", json(input));
  },
  createVersion(definitionId: number, input: PromptVersionInput) {
    return requestApi<PromptDefinition[]>(
      `/admin/ai/prompts/${definitionId}/versions`,
      json(input),
    );
  },
  deleteProvider(id: number) {
    return requestApi<{ deleted: true; id: number }>(`/ai/providers/${id}`, {
      method: "DELETE",
    });
  },
  listEvalState(definitionId: number) {
    return requestApi<PromptEvalState>(
      `/admin/ai/prompts/${definitionId}/evals`,
    );
  },
  listModelRoutes() {
    return requestApi<AiModelRoute[]>("/ai/model-routes");
  },
  listProviderModels(id: number) {
    return requestApi<AiProviderModel[]>(`/ai/providers/${id}/models`);
  },
  listPrompts() {
    return requestApi<PromptDefinition[]>("/admin/ai/prompts");
  },
  listProviders() {
    return requestApi<AiProvider[]>("/ai/providers");
  },
  syncProviderModels(id: number) {
    return requestApi<AiProviderModel[]>(`/ai/providers/${id}/models/sync`, {
      method: "POST",
    });
  },
  usageSummary() {
    return requestApi<AiUsageSummary>("/ai/usage-summary");
  },
  putModelRoute(role: AiModelRole, input: ModelRouteInput) {
    return requestApi<AiModelRoute>(`/ai/model-routes/${role}`, {
      ...json(input),
      method: "PUT",
    });
  },
  recordEvalRun(
    definitionId: number,
    version: number,
    input: {
      evaluator: string;
      results: Array<{
        authorizationPassed: boolean;
        caseId: number;
        costUsd: number;
        error: string | null;
        latencyMs: number;
        quality: number;
        schemaValid: boolean;
      }>;
    },
  ) {
    return requestApi<PromptEvalState["runs"][number]>(
      `/admin/ai/prompts/${definitionId}/versions/${version}/eval-runs`,
      json(input),
    );
  },
  reviewVersion(definitionId: number, version: number) {
    return requestApi<PromptDefinition[]>(
      `/admin/ai/prompts/${definitionId}/versions/${version}/review`,
      { method: "POST" },
    );
  },
  updateProvider(
    id: number,
    input: Partial<ProviderInput> & { clearApiKey?: true },
  ) {
    return requestApi<AiProvider>(`/ai/providers/${id}`, {
      ...json(input),
      method: "PATCH",
    });
  },
};
