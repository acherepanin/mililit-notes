import { BadRequestException } from "@nestjs/common";

import type {
  AiConversationStatus,
  AiModelRole,
  AiPromptModelRole,
  AiReasoningEffort,
  ConversationListInput,
  CreateConversationInput,
  CreateMessageInput,
  CreatePromptEvalCaseInput,
  CreateResponseInput,
  CreatePromptDefinitionInput,
  CreatePromptVersionInput,
  CreateProviderInput,
  JsonObject,
  MessageListInput,
  ModelRouteInput,
  RecordPromptEvalRunInput,
  UpdateConversationInput,
  UpdateProviderInput,
  VoiceSpeechInput,
} from "./ai.types.js";

const MODEL_ROLES = new Set<AiModelRole>([
  "fast",
  "chat",
  "reasoning",
  "vision",
  "voice",
  "transcription",
  "speech",
  "embedding",
]);
const PROMPT_MODEL_ROLES = new Set<AiModelRole>([
  "fast",
  "chat",
  "reasoning",
  "vision",
  "voice",
]);
const REASONING_EFFORTS = new Set<AiReasoningEffort>([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const CONVERSATION_STATUSES = new Set<AiConversationStatus>([
  "active",
  "archived",
]);

function record(value: unknown, field = "body"): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(
      `${field} must contain 1-${maximum} characters`,
    );
  }
  return normalized;
}

function nullableText(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  return value === undefined || value === null || value === ""
    ? null
    : text(value, field, maximum);
}

function optionalNullableText(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  return value === null || value === "" ? null : text(value, field, maximum);
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value as number;
}

function finiteNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new BadRequestException(
      `${field} must be between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be boolean`);
  }
  return value;
}

function reasoningEffort(value: unknown): AiReasoningEffort {
  if (
    typeof value !== "string" ||
    !REASONING_EFFORTS.has(value as AiReasoningEffort)
  ) {
    throw new BadRequestException("reasoningEffort is invalid");
  }
  return value as AiReasoningEffort;
}

function jsonObject(value: unknown, field: string): JsonObject {
  const result = record(value ?? {}, field);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 100_000) {
    throw new BadRequestException(`${field} exceeds 100 KB`);
  }
  return result;
}

function stringList(
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return [...new Set(value.map((item) => text(item, field, maximumLength)))];
}

function idList(value: unknown, field: string, maximumItems: number): number[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new BadRequestException(`${field} is invalid`);
  }
  const ids = value.map((item, index) =>
    positiveInteger(item, `${field}[${index}]`),
  );
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(`${field} contains duplicate IDs`);
  }
  return ids;
}

function queryInteger(
  value: unknown,
  field: string,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value) : value;
  const result = positiveInteger(parsed, field);
  if (result > maximum) {
    throw new BadRequestException(`${field} must not exceed ${maximum}`);
  }
  return result;
}

function conversationStatus(value: unknown): AiConversationStatus {
  if (
    typeof value !== "string" ||
    !CONVERSATION_STATUSES.has(value as AiConversationStatus)
  ) {
    throw new BadRequestException("conversation status is invalid");
  }
  return value as AiConversationStatus;
}

function promptModelRole(value: unknown): AiPromptModelRole {
  const role = parseModelRole(value);
  if (!PROMPT_MODEL_ROLES.has(role)) {
    throw new BadRequestException("modelRole is not valid for conversations");
  }
  return role as AiPromptModelRole;
}

export function encodeConversationCursor(updatedAt: Date, id: number): string {
  return Buffer.from(JSON.stringify([updatedAt.toISOString(), id])).toString(
    "base64url",
  );
}

function parseConversationCursor(value: unknown) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 200) {
    throw new BadRequestException("cursor is invalid");
  }
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error();
    const [timestamp, rawId] = decoded;
    if (typeof timestamp !== "string") throw new Error();
    const updatedAt = new Date(timestamp);
    const id = positiveInteger(rawId, "cursor.id");
    if (Number.isNaN(updatedAt.getTime())) throw new Error();
    return { id, updatedAt };
  } catch {
    throw new BadRequestException("cursor is invalid");
  }
}

export function parseConversationList(
  cursor: unknown,
  limit: unknown,
  status: unknown,
): ConversationListInput {
  return {
    cursor: parseConversationCursor(cursor),
    limit: queryInteger(limit, "limit", 30, 100),
    status:
      status === undefined || status === ""
        ? "active"
        : conversationStatus(status),
  };
}

export function parseCreateConversation(
  value: unknown,
): CreateConversationInput {
  const body = record(value);
  return {
    modelRole: promptModelRole(body.modelRole ?? "chat"),
    title: nullableText(body.title, "title", 200),
  };
}

export function parseUpdateConversation(
  value: unknown,
): UpdateConversationInput {
  const body = record(value);
  const input: UpdateConversationInput = {};
  if (body.modelRole !== undefined) {
    input.modelRole = promptModelRole(body.modelRole);
  }
  if (body.status !== undefined) {
    input.status = conversationStatus(body.status);
  }
  if (body.title !== undefined) {
    input.title = optionalNullableText(body.title, "title", 200);
  }
  if (Object.keys(input).length === 0) {
    throw new BadRequestException(
      "At least one conversation field is required",
    );
  }
  return input;
}

export function parseMessageList(
  beforeSequence: unknown,
  limit: unknown,
): MessageListInput {
  return {
    beforeSequence:
      beforeSequence === undefined || beforeSequence === ""
        ? null
        : queryInteger(beforeSequence, "beforeSequence", 0, 2_147_483_647),
    limit: queryInteger(limit, "limit", 50, 100),
  };
}

export function parseCreateMessage(value: unknown): CreateMessageInput {
  const body = record(value);
  if (
    !Array.isArray(body.parts) ||
    body.parts.length < 1 ||
    body.parts.length > 16
  ) {
    throw new BadRequestException("parts must contain 1-16 items");
  }
  let textBytes = 0;
  const parts = body.parts.map((raw, index) => {
    const part = record(raw, `parts[${index}]`);
    if (part.type === "text") {
      const value = text(part.text, `parts[${index}].text`, 100_000);
      textBytes += Buffer.byteLength(value, "utf8");
      return { text: value, type: "text" as const };
    }
    if (part.type === "file" || part.type === "image") {
      return {
        fileId: positiveInteger(part.fileId, `parts[${index}].fileId`),
        type: part.type as "file" | "image",
      };
    }
    throw new BadRequestException(`parts[${index}].type is invalid`);
  });
  if (textBytes > 200_000) {
    throw new BadRequestException("text parts exceed 200 KB");
  }
  const context = record(body.context ?? {}, "context");
  return {
    context: {
      fileIds: idList(context.fileIds ?? [], "context.fileIds", 12),
      includeSecrets:
        context.includeSecrets === undefined
          ? false
          : boolean(context.includeSecrets, "context.includeSecrets"),
      noteIds: idList(context.noteIds ?? [], "context.noteIds", 12),
    },
    parts,
  };
}

export function parseCreateResponse(value: unknown): CreateResponseInput {
  const body = record(value);
  const promptKey = text(
    body.promptKey ?? "notes.assistant",
    "promptKey",
    80,
  ).toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,79}$/.test(promptKey)) {
    throw new BadRequestException("promptKey format is invalid");
  }
  return {
    ...parseCreateMessage(body),
    model: nullableText(body.model, "model", 200),
    promptKey,
  };
}

export function parseModelRole(value: unknown): AiModelRole {
  if (typeof value !== "string" || !MODEL_ROLES.has(value as AiModelRole)) {
    throw new BadRequestException("AI model role is invalid");
  }
  return value as AiModelRole;
}

export function parseCreateProvider(value: unknown): CreateProviderInput {
  const body = record(value);
  const apiKey =
    body.apiKey === undefined ? undefined : text(body.apiKey, "apiKey", 20_000);
  return {
    ...(apiKey ? { apiKey } : {}),
    baseUrl: text(body.baseUrl, "baseUrl", 500),
    model: nullableText(body.model, "model", 200),
    providerName: text(body.providerName, "providerName", 80),
  };
}

export function parseUpdateProvider(value: unknown): UpdateProviderInput {
  const body = record(value);
  const input: UpdateProviderInput = {};
  if (body.providerName !== undefined) {
    input.providerName = text(body.providerName, "providerName", 80);
  }
  if (body.baseUrl !== undefined) {
    input.baseUrl = text(body.baseUrl, "baseUrl", 500);
  }
  if (body.model !== undefined) {
    input.model = nullableText(body.model, "model", 200);
  }
  if (body.apiKey !== undefined) {
    input.apiKey = text(body.apiKey, "apiKey", 20_000);
  }
  if (body.clearApiKey !== undefined) {
    if (!boolean(body.clearApiKey, "clearApiKey")) {
      throw new BadRequestException("clearApiKey must be true when provided");
    }
    input.clearApiKey = true;
  }
  if (input.apiKey && input.clearApiKey) {
    throw new BadRequestException(
      "apiKey and clearApiKey are mutually exclusive",
    );
  }
  if (Object.keys(input).length === 0) {
    throw new BadRequestException("At least one provider change is required");
  }
  return input;
}

export function parseModelRoute(value: unknown): ModelRouteInput {
  const body = record(value);
  const temperature = body.temperature ?? null;
  if (
    temperature !== null &&
    (typeof temperature !== "number" || temperature < 0 || temperature > 2)
  ) {
    throw new BadRequestException("temperature must be between 0 and 2");
  }
  const maxOutputTokens = body.maxOutputTokens ?? null;
  if (
    maxOutputTokens !== null &&
    (!Number.isSafeInteger(maxOutputTokens) || (maxOutputTokens as number) < 1)
  ) {
    throw new BadRequestException("maxOutputTokens must be a positive integer");
  }
  return {
    enabled:
      body.enabled === undefined ? true : boolean(body.enabled, "enabled"),
    fallbackModels: stringList(
      body.fallbackModels ?? [],
      "fallbackModels",
      5,
      200,
    ),
    maxOutputTokens: maxOutputTokens as number | null,
    model: text(body.model, "model", 200),
    providerSettingId:
      body.providerSettingId === undefined || body.providerSettingId === null
        ? null
        : positiveInteger(body.providerSettingId, "providerSettingId"),
    reasoningEffort: reasoningEffort(body.reasoningEffort ?? "none"),
    temperature,
  };
}

export function parsePromptDefinition(
  value: unknown,
): CreatePromptDefinitionInput {
  const body = record(value);
  const promptKey = text(body.promptKey, "promptKey", 80).toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,79}$/.test(promptKey)) {
    throw new BadRequestException("promptKey format is invalid");
  }
  return {
    description: nullableText(body.description, "description", 2_000),
    name: text(body.name, "name", 160),
    promptKey,
    securityPolicyKey: text(body.securityPolicyKey, "securityPolicyKey", 80),
  };
}

export function parsePromptVersion(value: unknown): CreatePromptVersionInput {
  const body = record(value);
  const content = text(body.content, "content", 200_000);
  if (Buffer.byteLength(content, "utf8") > 500_000) {
    throw new BadRequestException("content exceeds 500 KB");
  }
  const modelRole = parseModelRole(body.modelRole ?? "chat");
  if (!PROMPT_MODEL_ROLES.has(modelRole)) {
    throw new BadRequestException("modelRole is not valid for prompts");
  }
  return {
    approvalPolicy: jsonObject(body.approvalPolicy, "approvalPolicy"),
    changeSummary: nullableText(body.changeSummary, "changeSummary", 1_000),
    content,
    inputSchema: jsonObject(body.inputSchema, "inputSchema"),
    modelRole: modelRole as AiPromptModelRole,
    outputSchema: jsonObject(body.outputSchema, "outputSchema"),
    reasoningEffort: reasoningEffort(body.reasoningEffort ?? "none"),
    retryLimit:
      body.retryLimit === undefined
        ? 0
        : (() => {
            const result = body.retryLimit;
            if (
              !Number.isSafeInteger(result) ||
              (result as number) < 0 ||
              (result as number) > 5
            ) {
              throw new BadRequestException(
                "retryLimit must be between 0 and 5",
              );
            }
            return result as number;
          })(),
    stopConditions: jsonObject(body.stopConditions, "stopConditions"),
    toolAllowlist: stringList(
      body.toolAllowlist ?? [],
      "toolAllowlist",
      64,
      120,
    ),
  };
}

export function parsePromptEvalCase(value: unknown): CreatePromptEvalCaseInput {
  const body = record(value);
  const thresholds = record(body.thresholds ?? {}, "thresholds");
  const caseKey = text(body.caseKey, "caseKey", 80).toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,79}$/.test(caseKey)) {
    throw new BadRequestException("caseKey format is invalid");
  }
  return {
    caseKey,
    expected: jsonObject(body.expected, "expected"),
    input: jsonObject(body.input, "input"),
    name: text(body.name, "name", 160),
    thresholds: {
      maxCostUsd: finiteNumber(
        thresholds.maxCostUsd ?? 1,
        "thresholds.maxCostUsd",
        0,
        1_000,
      ),
      maxLatencyMs: finiteNumber(
        thresholds.maxLatencyMs ?? 30_000,
        "thresholds.maxLatencyMs",
        1,
        3_600_000,
      ),
      minQuality: finiteNumber(
        thresholds.minQuality ?? 0.8,
        "thresholds.minQuality",
        0,
        1,
      ),
      requireAuthorization:
        thresholds.requireAuthorization === undefined
          ? true
          : boolean(
              thresholds.requireAuthorization,
              "thresholds.requireAuthorization",
            ),
      requireSchema:
        thresholds.requireSchema === undefined
          ? true
          : boolean(thresholds.requireSchema, "thresholds.requireSchema"),
    },
  };
}

export function parsePromptEvalRun(value: unknown): RecordPromptEvalRunInput {
  const body = record(value);
  if (
    !Array.isArray(body.results) ||
    body.results.length < 1 ||
    body.results.length > 500
  ) {
    throw new BadRequestException("results must contain 1-500 items");
  }
  const results = body.results.map((value, index) => {
    const result = record(value, `results[${index}]`);
    return {
      authorizationPassed: boolean(
        result.authorizationPassed,
        `results[${index}].authorizationPassed`,
      ),
      caseId: positiveInteger(result.caseId, `results[${index}].caseId`),
      costUsd: finiteNumber(
        result.costUsd,
        `results[${index}].costUsd`,
        0,
        1_000_000,
      ),
      error: nullableText(result.error, `results[${index}].error`, 2_000),
      latencyMs: finiteNumber(
        result.latencyMs,
        `results[${index}].latencyMs`,
        0,
        3_600_000,
      ),
      quality: finiteNumber(result.quality, `results[${index}].quality`, 0, 1),
      schemaValid: boolean(result.schemaValid, `results[${index}].schemaValid`),
    };
  });
  if (new Set(results.map((result) => result.caseId)).size !== results.length) {
    throw new BadRequestException("results contains duplicate case IDs");
  }
  return {
    evaluator: text(body.evaluator ?? "promptfoo", "evaluator", 100),
    results,
  };
}

export function parseVoiceSpeech(value: unknown): VoiceSpeechInput {
  const body = record(value);
  return {
    text: text(body.text, "text", 10_000),
    voice: text(body.voice ?? "marin", "voice", 64).toLowerCase(),
  };
}
