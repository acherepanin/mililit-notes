import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./identity.js";
import { notes } from "./workspace.js";

type JsonObject = Record<string, unknown>;

const vector = customType<{ data: string }>({
  dataType() {
    return "vector";
  },
});

export const aiUserSettings = pgTable(
  "ai_user_settings",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    allowReadSecrets: boolean("allow_read_secrets").notNull().default(false),
    requireActionConfirmation: boolean("require_action_confirmation")
      .notNull()
      .default(true),
    dailyRequestLimit: integer("daily_request_limit"),
    dailyTokenLimit: integer("daily_token_limit"),
    providerName: text("provider_name").notNull().default("OpenAI-compatible"),
    baseUrl: text("base_url").notNull().default("https://api.openai.com/v1"),
    model: text("model"),
    apiKeyEncrypted: text("api_key_encrypted"),
    apiKeyHint: text("api_key_hint"),
    apiKeyUpdatedAt: timestamp("api_key_updated_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastConnectionCheckAt: timestamp("last_connection_check_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastConnectionCheckStatus: text("last_connection_check_status"),
    lastModelsSyncAt: timestamp("last_models_sync_at", {
      mode: "date",
      withTimezone: true,
    }),
    modelsSyncStatus: text("models_sync_status"),
    modelsSyncError: text("models_sync_error"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "ai_user_settings_daily_request_limit_check",
      sql`${table.dailyRequestLimit} is null or ${table.dailyRequestLimit} > 0`,
    ),
    check(
      "ai_user_settings_daily_token_limit_check",
      sql`${table.dailyTokenLimit} is null or ${table.dailyTokenLimit} > 0`,
    ),
  ],
);

export const aiProviderSettings = pgTable(
  "ai_provider_settings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerName: text("provider_name").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model"),
    apiKeyEncrypted: text("api_key_encrypted"),
    apiKeyHint: text("api_key_hint"),
    apiKeyUpdatedAt: timestamp("api_key_updated_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastConnectionCheckAt: timestamp("last_connection_check_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastConnectionCheckStatus: text("last_connection_check_status"),
    lastModelsSyncAt: timestamp("last_models_sync_at", {
      mode: "date",
      withTimezone: true,
    }),
    modelsSyncStatus: text("models_sync_status"),
    modelsSyncError: text("models_sync_error"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_provider_settings_user_provider_url_unique").on(
      table.userId,
      table.providerName,
      table.baseUrl,
    ),
  ],
);

export const aiProviderModels = pgTable(
  "ai_provider_models",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerName: text("provider_name").notNull(),
    modelId: text("model_id").notNull(),
    label: text("label").notNull(),
    tier: text("tier").notNull().default("unknown"),
    quality: text("quality").notNull().default("unknown"),
    speed: text("speed").notNull().default("unknown"),
    cost: text("cost").notNull().default("unknown"),
    inputPricePer1m: numeric("input_price_per_1m", {
      mode: "number",
      precision: 18,
      scale: 8,
    }),
    cachedInputPricePer1m: numeric("cached_input_price_per_1m", {
      mode: "number",
      precision: 18,
      scale: 8,
    }),
    outputPricePer1m: numeric("output_price_per_1m", {
      mode: "number",
      precision: 18,
      scale: 8,
    }),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    isDeprecated: boolean("is_deprecated").notNull().default(false),
    providerCreatedAt: timestamp("provider_created_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastSeenAt: timestamp("last_seen_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_provider_models_user_provider_model_unique").on(
      table.userId,
      table.providerName,
      table.modelId,
    ),
    index("ai_provider_models_user_seen_idx").on(
      table.userId,
      table.lastSeenAt,
      table.id,
    ),
    check(
      "ai_provider_models_prices_check",
      sql`coalesce(${table.inputPricePer1m}, 0) >= 0 and coalesce(${table.cachedInputPricePer1m}, 0) >= 0 and coalesce(${table.outputPricePer1m}, 0) >= 0`,
    ),
  ],
);

export const aiModelRoutes = pgTable(
  "ai_model_routes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    providerSettingId: integer("provider_setting_id").references(
      () => aiProviderSettings.id,
      { onDelete: "set null" },
    ),
    model: text("model").notNull(),
    reasoningEffort: text("reasoning_effort").notNull().default("none"),
    temperature: numeric("temperature", {
      mode: "number",
      precision: 4,
      scale: 3,
    }),
    maxOutputTokens: integer("max_output_tokens"),
    fallbackModels: jsonb("fallback_models")
      .$type<string[]>()
      .notNull()
      .default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_model_routes_user_role_unique").on(
      table.userId,
      table.role,
    ),
    index("ai_model_routes_provider_idx").on(
      table.providerSettingId,
      table.userId,
    ),
    check(
      "ai_model_routes_role_check",
      sql`${table.role} in ('fast', 'chat', 'reasoning', 'vision', 'voice', 'transcription', 'speech', 'embedding')`,
    ),
    check(
      "ai_model_routes_reasoning_effort_check",
      sql`${table.reasoningEffort} in ('none', 'low', 'medium', 'high', 'xhigh')`,
    ),
    check(
      "ai_model_routes_temperature_check",
      sql`${table.temperature} is null or ${table.temperature} between 0 and 2`,
    ),
    check(
      "ai_model_routes_max_output_tokens_check",
      sql`${table.maxOutputTokens} is null or ${table.maxOutputTokens} > 0`,
    ),
  ],
);

export const aiModelCatalog = pgTable(
  "ai_model_catalog",
  {
    modelId: text("model_id").primaryKey(),
    label: text("label"),
    tier: text("tier").notNull().default("unknown"),
    quality: text("quality").notNull().default("unknown"),
    speed: text("speed").notNull().default("unknown"),
    cost: text("cost").notNull().default("unknown"),
    score: integer("score").notNull().default(50),
    speedScore: integer("speed_score").notNull().default(50),
    valueScore: integer("value_score").notNull().default(50),
    sortRank: integer("sort_rank").notNull().default(0),
    inputPricePer1m: numeric("input_price_per_1m", {
      mode: "number",
      precision: 18,
      scale: 8,
    }),
    cachedInputPricePer1m: numeric("cached_input_price_per_1m", {
      mode: "number",
      precision: 18,
      scale: 8,
    }),
    outputPricePer1m: numeric("output_price_per_1m", {
      mode: "number",
      precision: 18,
      scale: 8,
    }),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    isDeprecated: boolean("is_deprecated").notNull().default(false),
    source: text("source").notNull().default("builtin"),
    lastSeenAt: timestamp("last_seen_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_model_catalog_rank_idx").on(
      table.isDeprecated,
      table.sortRank,
      table.modelId,
    ),
    check(
      "ai_model_catalog_scores_check",
      sql`${table.score} between 0 and 100 and ${table.speedScore} between 0 and 100 and ${table.valueScore} between 0 and 100`,
    ),
    check(
      "ai_model_catalog_prices_check",
      sql`coalesce(${table.inputPricePer1m}, 0) >= 0 and coalesce(${table.cachedInputPricePer1m}, 0) >= 0 and coalesce(${table.outputPricePer1m}, 0) >= 0`,
    ),
  ],
);

export const aiPromptDefinitions = pgTable(
  "ai_prompt_definitions",
  {
    id: serial("id").primaryKey(),
    promptKey: text("prompt_key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    origin: text("origin").notNull().default("admin"),
    securityPolicyKey: text("security_policy_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_prompt_definitions_key_unique").on(
      sql`lower(${table.promptKey})`,
    ),
    check(
      "ai_prompt_definitions_key_check",
      sql`${table.promptKey} ~ '^[a-z][a-z0-9._-]{2,79}$'`,
    ),
    check(
      "ai_prompt_definitions_origin_check",
      sql`${table.origin} in ('system', 'admin')`,
    ),
  ],
);

export const aiPromptVersions = pgTable(
  "ai_prompt_versions",
  {
    id: serial("id").primaryKey(),
    definitionId: integer("definition_id")
      .notNull()
      .references(() => aiPromptDefinitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    content: text("content").notNull(),
    inputSchema: jsonb("input_schema")
      .$type<JsonObject>()
      .notNull()
      .default({}),
    outputSchema: jsonb("output_schema")
      .$type<JsonObject>()
      .notNull()
      .default({}),
    modelRole: text("model_role").notNull().default("chat"),
    reasoningEffort: text("reasoning_effort").notNull().default("none"),
    toolAllowlist: jsonb("tool_allowlist")
      .$type<string[]>()
      .notNull()
      .default([]),
    approvalPolicy: jsonb("approval_policy")
      .$type<JsonObject>()
      .notNull()
      .default({}),
    retryLimit: integer("retry_limit").notNull().default(0),
    stopConditions: jsonb("stop_conditions")
      .$type<JsonObject>()
      .notNull()
      .default({}),
    changeSummary: text("change_summary"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    activatedAt: timestamp("activated_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_prompt_versions_definition_version_unique").on(
      table.definitionId,
      table.version,
    ),
    uniqueIndex("ai_prompt_versions_one_active_unique")
      .on(table.definitionId)
      .where(sql`${table.status} = 'active'`),
    index("ai_prompt_versions_definition_status_idx").on(
      table.definitionId,
      table.status,
      table.version,
    ),
    check("ai_prompt_versions_version_check", sql`${table.version} > 0`),
    check(
      "ai_prompt_versions_status_check",
      sql`${table.status} in ('draft', 'review', 'active', 'archived')`,
    ),
    check(
      "ai_prompt_versions_content_check",
      sql`length(btrim(${table.content})) > 0`,
    ),
    check(
      "ai_prompt_versions_model_role_check",
      sql`${table.modelRole} in ('fast', 'chat', 'reasoning', 'vision', 'voice')`,
    ),
    check(
      "ai_prompt_versions_reasoning_effort_check",
      sql`${table.reasoningEffort} in ('none', 'low', 'medium', 'high', 'xhigh')`,
    ),
    check(
      "ai_prompt_versions_retry_limit_check",
      sql`${table.retryLimit} between 0 and 5`,
    ),
    check(
      "ai_prompt_versions_activation_check",
      sql`${table.status} <> 'active' or ${table.activatedAt} is not null`,
    ),
  ],
);

export const aiPromptEvalCases = pgTable(
  "ai_prompt_eval_cases",
  {
    id: serial("id").primaryKey(),
    definitionId: integer("definition_id")
      .notNull()
      .references(() => aiPromptDefinitions.id, { onDelete: "cascade" }),
    caseKey: text("case_key").notNull(),
    name: text("name").notNull(),
    input: jsonb("input").$type<JsonObject>().notNull(),
    expected: jsonb("expected").$type<JsonObject>().notNull().default({}),
    thresholds: jsonb("thresholds").$type<JsonObject>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_prompt_eval_cases_definition_key_revision_unique").on(
      table.definitionId,
      table.caseKey,
      table.revision,
    ),
    uniqueIndex("ai_prompt_eval_cases_one_enabled_unique")
      .on(table.definitionId, table.caseKey)
      .where(sql`${table.enabled} = true`),
    index("ai_prompt_eval_cases_definition_enabled_idx").on(
      table.definitionId,
      table.enabled,
      table.id,
    ),
    check(
      "ai_prompt_eval_cases_key_check",
      sql`${table.caseKey} ~ '^[a-z][a-z0-9._-]{2,79}$'`,
    ),
    check("ai_prompt_eval_cases_revision_check", sql`${table.revision} > 0`),
  ],
);

export const aiPromptEvalRuns = pgTable(
  "ai_prompt_eval_runs",
  {
    id: serial("id").primaryKey(),
    promptVersionId: integer("prompt_version_id")
      .notNull()
      .references(() => aiPromptVersions.id, { onDelete: "cascade" }),
    suiteHash: text("suite_hash").notNull(),
    evaluator: text("evaluator").notNull().default("promptfoo"),
    status: text("status").notNull(),
    results: jsonb("results").$type<JsonObject[]>().notNull().default([]),
    metrics: jsonb("metrics").$type<JsonObject>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_prompt_eval_runs_version_created_idx").on(
      table.promptVersionId,
      table.createdAt,
      table.id,
    ),
    check(
      "ai_prompt_eval_runs_hash_check",
      sql`${table.suiteHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "ai_prompt_eval_runs_evaluator_check",
      sql`length(btrim(${table.evaluator})) > 0`,
    ),
    check(
      "ai_prompt_eval_runs_status_check",
      sql`${table.status} in ('passed', 'failed', 'error')`,
    ),
    check(
      "ai_prompt_eval_runs_completion_check",
      sql`${table.completedAt} is not null`,
    ),
  ],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("web"),
    externalThreadId: text("external_thread_id"),
    title: text("title"),
    status: text("status").notNull().default("active"),
    modelRole: text("model_role").notNull().default("chat"),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    lastMessageAt: timestamp("last_message_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ai_conversations_id_user_unique").on(table.id, table.userId),
    uniqueIndex("ai_conversations_external_thread_unique")
      .on(table.userId, table.channel, table.externalThreadId)
      .where(sql`${table.externalThreadId} is not null`),
    index("ai_conversations_user_status_updated_idx").on(
      table.userId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    check(
      "ai_conversations_channel_check",
      sql`${table.channel} in ('web', 'telegram', 'vk', 'api')`,
    ),
    check(
      "ai_conversations_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
    check(
      "ai_conversations_model_role_check",
      sql`${table.modelRole} in ('fast', 'chat', 'reasoning', 'vision', 'voice')`,
    ),
  ],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull(),
    userId: integer("user_id").notNull(),
    sequence: integer("sequence").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    content: jsonb("content").$type<JsonObject[]>().notNull().default([]),
    contentText: text("content_text").notNull().default(""),
    providerName: text("provider_name"),
    model: text("model"),
    promptVersionId: integer("prompt_version_id").references(
      () => aiPromptVersions.id,
      { onDelete: "set null" },
    ),
    providerResponseId: text("provider_response_id"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ai_messages_id_user_unique").on(table.id, table.userId),
    uniqueIndex("ai_messages_conversation_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    index("ai_messages_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      columns: [table.conversationId, table.userId],
      foreignColumns: [aiConversations.id, aiConversations.userId],
      name: "ai_messages_conversation_user_fk",
    }).onDelete("cascade"),
    check("ai_messages_sequence_check", sql`${table.sequence} > 0`),
    check(
      "ai_messages_role_check",
      sql`${table.role} in ('user', 'assistant', 'system', 'tool')`,
    ),
    check(
      "ai_messages_status_check",
      sql`${table.status} in ('pending', 'streaming', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const aiToolCalls = pgTable(
  "ai_tool_calls",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id").notNull(),
    userId: integer("user_id").notNull(),
    toolName: text("tool_name").notNull(),
    riskClass: text("risk_class").notNull(),
    arguments: jsonb("arguments").$type<JsonObject>().notNull(),
    argumentsHash: text("arguments_hash").notNull(),
    status: text("status").notNull().default("requested"),
    requiresConfirmation: boolean("requires_confirmation")
      .notNull()
      .default(false),
    result: jsonb("result").$type<JsonObject>(),
    errorCode: text("error_code"),
    idempotencyKey: text("idempotency_key"),
    correlationId: text("correlation_id"),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_tool_calls_failed_created_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'failed'`),
    index("ai_tool_calls_correlation_idx")
      .on(table.correlationId, table.createdAt, table.id)
      .where(sql`${table.correlationId} is not null`),
    unique("ai_tool_calls_id_user_arguments_unique").on(
      table.id,
      table.userId,
      table.argumentsHash,
    ),
    uniqueIndex("ai_tool_calls_user_idempotency_unique")
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("ai_tool_calls_message_status_idx").on(
      table.messageId,
      table.status,
      table.id,
    ),
    foreignKey({
      columns: [table.messageId, table.userId],
      foreignColumns: [aiMessages.id, aiMessages.userId],
      name: "ai_tool_calls_message_user_fk",
    }).onDelete("cascade"),
    check(
      "ai_tool_calls_risk_class_check",
      sql`${table.riskClass} in ('read_only', 'reversible_write', 'destructive', 'external', 'costly')`,
    ),
    check(
      "ai_tool_calls_status_check",
      sql`${table.status} in ('requested', 'awaiting_confirmation', 'approved', 'executing', 'succeeded', 'failed', 'rejected', 'expired', 'cancelled')`,
    ),
    check(
      "ai_tool_calls_arguments_hash_check",
      sql`${table.argumentsHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "ai_tool_calls_confirmation_state_check",
      sql`not ${table.requiresConfirmation} or ${table.status} <> 'requested'`,
    ),
  ],
);

export const aiToolConfirmations = pgTable(
  "ai_tool_confirmations",
  {
    id: serial("id").primaryKey(),
    toolCallId: integer("tool_call_id").notNull(),
    userId: integer("user_id").notNull(),
    argumentsHash: text("arguments_hash").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    decidedAt: timestamp("decided_at", { mode: "date", withTimezone: true }),
    consumedAt: timestamp("consumed_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_tool_confirmations_tool_call_unique").on(table.toolCallId),
    uniqueIndex("ai_tool_confirmations_token_hash_unique").on(table.tokenHash),
    index("ai_tool_confirmations_user_status_expiry_idx").on(
      table.userId,
      table.status,
      table.expiresAt,
      table.id,
    ),
    foreignKey({
      columns: [table.toolCallId, table.userId, table.argumentsHash],
      foreignColumns: [
        aiToolCalls.id,
        aiToolCalls.userId,
        aiToolCalls.argumentsHash,
      ],
      name: "ai_tool_confirmations_exact_call_fk",
    }).onDelete("cascade"),
    check(
      "ai_tool_confirmations_status_check",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'consumed', 'expired')`,
    ),
    check(
      "ai_tool_confirmations_arguments_hash_check",
      sql`${table.argumentsHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "ai_tool_confirmations_token_hash_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "ai_tool_confirmations_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "ai_tool_confirmations_decision_check",
      sql`${table.status} in ('pending', 'expired') or ${table.decidedAt} is not null`,
    ),
    check(
      "ai_tool_confirmations_consumption_check",
      sql`${table.status} <> 'consumed' or ${table.consumedAt} is not null`,
    ),
  ],
);

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerName: text("provider_name").notNull(),
    model: text("model").notNull(),
    requestId: text("request_id"),
    conversationId: integer("conversation_id").references(
      () => aiConversations.id,
      { onDelete: "set null" },
    ),
    messageId: integer("message_id").references(() => aiMessages.id, {
      onDelete: "set null",
    }),
    promptVersionId: integer("prompt_version_id").references(
      () => aiPromptVersions.id,
      { onDelete: "set null" },
    ),
    requestKind: text("request_kind").notNull().default("chat"),
    status: text("status").notNull().default("succeeded"),
    providerRequestId: text("provider_request_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    inputAudioTokens: integer("input_audio_tokens").notNull().default(0),
    outputAudioTokens: integer("output_audio_tokens").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    reservedTokens: integer("reserved_tokens").notNull().default(0),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    reservationReleasedAt: timestamp("reservation_released_at", {
      mode: "date",
      withTimezone: true,
    }),
    latencyMs: integer("latency_ms"),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    inputCost: numeric("input_cost", {
      mode: "number",
      precision: 18,
      scale: 8,
    })
      .notNull()
      .default(0),
    cachedInputCost: numeric("cached_input_cost", {
      mode: "number",
      precision: 18,
      scale: 8,
    })
      .notNull()
      .default(0),
    outputCost: numeric("output_cost", {
      mode: "number",
      precision: 18,
      scale: 8,
    })
      .notNull()
      .default(0),
    totalCost: numeric("total_cost", {
      mode: "number",
      precision: 18,
      scale: 8,
    })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    errorCode: text("error_code"),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_usage_logs_user_request_unique")
      .on(table.userId, table.requestId)
      .where(sql`${table.requestId} is not null`),
    index("ai_usage_logs_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    index("ai_usage_logs_created_user_model_idx").on(
      table.createdAt,
      table.userId,
      table.providerName,
      table.model,
    ),
    index("ai_usage_logs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    index("ai_usage_logs_provider_request_idx").on(
      table.providerName,
      table.providerRequestId,
    ),
    check("ai_usage_logs_input_check", sql`${table.inputTokens} >= 0`),
    check("ai_usage_logs_output_check", sql`${table.outputTokens} >= 0`),
    check(
      "ai_usage_logs_token_details_check",
      sql`${table.cachedInputTokens} >= 0 and ${table.reasoningTokens} >= 0 and ${table.inputAudioTokens} >= 0 and ${table.outputAudioTokens} >= 0 and ${table.toolCallCount} >= 0`,
    ),
    check(
      "ai_usage_logs_reservation_check",
      sql`${table.reservedTokens} >= 0 and (${table.reservedTokens} = 0 or ${table.reservationExpiresAt} is not null)`,
    ),
    check(
      "ai_usage_logs_request_kind_check",
      sql`${table.requestKind} in ('chat', 'response', 'embedding', 'transcription', 'speech', 'realtime', 'moderation')`,
    ),
    check(
      "ai_usage_logs_status_check",
      sql`${table.status} in ('started', 'streaming', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "ai_usage_logs_latency_check",
      sql`coalesce(${table.latencyMs}, 0) >= 0 and coalesce(${table.timeToFirstTokenMs}, 0) >= 0`,
    ),
    check(
      "ai_usage_logs_cost_check",
      sql`${table.inputCost} >= 0 and ${table.cachedInputCost} >= 0 and ${table.outputCost} >= 0 and ${table.totalCost} >= 0`,
    ),
    check(
      "ai_usage_logs_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const aiAuditLogs = pgTable(
  "ai_audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    details: jsonb("details").$type<JsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_audit_logs_created_id_idx").on(table.createdAt, table.id),
    index("ai_audit_logs_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const aiNoteEmbeddings = pgTable(
  "ai_note_embeddings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: integer("note_id").notNull(),
    providerName: text("provider_name").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
      name: "ai_note_embeddings_note_user_fk",
    }).onDelete("cascade"),
    uniqueIndex("ai_note_embeddings_scope_unique").on(
      table.userId,
      table.noteId,
      table.providerName,
      table.baseUrl,
      table.model,
    ),
    index("ai_note_embeddings_user_model_idx").on(
      table.userId,
      table.providerName,
      table.model,
    ),
  ],
);

export const aiBotAdminSettings = pgTable(
  "ai_bot_admin_settings",
  {
    provider: text("provider").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    webhookUrl: text("webhook_url"),
    botTokenEncrypted: text("bot_token_encrypted"),
    accessTokenEncrypted: text("access_token_encrypted"),
    secretEncrypted: text("secret_encrypted"),
    groupId: text("group_id"),
    confirmationCode: text("confirmation_code"),
    allowSecrets: boolean("allow_secrets").notNull().default(false),
    requireConfirmation: boolean("require_confirmation")
      .notNull()
      .default(true),
    dailyRequestLimit: integer("daily_request_limit"),
    dailyReadLimit: integer("daily_read_limit"),
    dailyWriteLimit: integer("daily_write_limit"),
    lastCheckAt: timestamp("last_check_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastCheckStatus: text("last_check_status"),
    lastCheckError: text("last_check_error"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "ai_bot_admin_settings_provider_check",
      sql`${table.provider} in ('telegram', 'vk')`,
    ),
    check(
      "ai_bot_admin_settings_limits_check",
      sql`coalesce(${table.dailyRequestLimit}, 1) > 0 and coalesce(${table.dailyReadLimit}, 1) > 0 and coalesce(${table.dailyWriteLimit}, 1) > 0`,
    ),
  ],
);

export const aiBotUserSettings = pgTable(
  "ai_bot_user_settings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    accessMode: text("access_mode").notNull().default("read"),
    allowSecrets: boolean("allow_secrets").notNull().default(false),
    allowNoteRead: boolean("allow_note_read").notNull().default(true),
    allowNoteWrite: boolean("allow_note_write").notNull().default(false),
    allowNoteDelete: boolean("allow_note_delete").notNull().default(false),
    allowTags: boolean("allow_tags").notNull().default(false),
    allowTemplates: boolean("allow_templates").notNull().default(false),
    allowVersions: boolean("allow_versions").notNull().default(false),
    allowAttachments: boolean("allow_attachments").notNull().default(false),
    allowShareLinks: boolean("allow_share_links").notNull().default(false),
    dailyRequestLimit: integer("daily_request_limit"),
    dailyReadLimit: integer("daily_read_limit"),
    dailyWriteLimit: integer("daily_write_limit"),
    linkedExternalId: text("linked_external_id"),
    linkedUsername: text("linked_username"),
    linkedAt: timestamp("linked_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_bot_user_settings_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
    index("ai_bot_user_settings_provider_external_idx").on(
      table.provider,
      table.linkedExternalId,
    ),
    uniqueIndex("ai_bot_user_settings_provider_external_unique")
      .on(table.provider, table.linkedExternalId)
      .where(sql`${table.linkedExternalId} is not null`),
    check(
      "ai_bot_user_settings_provider_check",
      sql`${table.provider} in ('telegram', 'vk')`,
    ),
    check(
      "ai_bot_user_settings_access_mode_check",
      sql`${table.accessMode} in ('read', 'write')`,
    ),
    check(
      "ai_bot_user_settings_limits_check",
      sql`coalesce(${table.dailyRequestLimit}, 1) > 0 and coalesce(${table.dailyReadLimit}, 1) > 0 and coalesce(${table.dailyWriteLimit}, 1) > 0`,
    ),
  ],
);

export const aiBotLinkCodes = pgTable(
  "ai_bot_link_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ai_bot_link_codes_hash_unique").on(table.codeHash),
    index("ai_bot_link_codes_user_provider_expires_idx").on(
      table.userId,
      table.provider,
      table.expiresAt,
      table.id,
    ),
    check(
      "ai_bot_link_codes_provider_check",
      sql`${table.provider} in ('telegram', 'vk')`,
    ),
  ],
);

export const aiBotPendingActions = pgTable(
  "ai_bot_pending_actions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    actionName: text("action_name").notNull(),
    actionPayload: jsonb("action_payload").$type<JsonObject>().notNull(),
    status: text("status").notNull().default("pending"),
    claimedAt: timestamp("claimed_at", {
      mode: "date",
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    responseText: text("response_text"),
    lastError: text("last_error"),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_bot_pending_actions_scope_expires_idx").on(
      table.userId,
      table.provider,
      table.externalId,
      table.expiresAt,
      table.id,
    ),
    index("ai_bot_pending_actions_status_expires_idx").on(
      table.status,
      table.expiresAt,
      table.id,
    ),
    check(
      "ai_bot_pending_actions_provider_check",
      sql`${table.provider} in ('telegram', 'vk')`,
    ),
    check(
      "ai_bot_pending_actions_status_check",
      sql`${table.status} in ('pending', 'processing', 'succeeded', 'rejected', 'failed', 'expired')`,
    ),
  ],
);

export const aiBotUsageLogs = pgTable(
  "ai_bot_usage_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    actionName: text("action_name"),
    usageCount: integer("usage_count").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_bot_usage_logs_user_scope_created_idx").on(
      table.userId,
      table.provider,
      table.kind,
      table.createdAt,
      table.id,
    ),
    index("ai_bot_usage_logs_created_scope_idx").on(
      table.createdAt,
      table.provider,
      table.kind,
    ),
    check(
      "ai_bot_usage_logs_provider_check",
      sql`${table.provider} in ('telegram', 'vk')`,
    ),
    check(
      "ai_bot_usage_logs_kind_check",
      sql`${table.kind} in ('message', 'read', 'write')`,
    ),
    check("ai_bot_usage_logs_count_check", sql`${table.usageCount} > 0`),
  ],
);

export const aiBotWebhookEvents = pgTable(
  "ai_bot_webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    externalId: text("external_id"),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("received"),
    attempts: integer("attempts").notNull().default(1),
    correlationId: text("correlation_id").notNull(),
    availableAt: timestamp("available_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { mode: "date", withTimezone: true }),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_bot_webhook_events_terminal_created_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.status} in ('succeeded', 'failed')`),
    index("ai_bot_webhook_events_failed_created_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'failed'`),
    uniqueIndex("ai_bot_webhook_events_provider_event_unique").on(
      table.provider,
      table.eventId,
    ),
    index("ai_bot_webhook_events_status_available_idx").on(
      table.status,
      table.availableAt,
      table.id,
    ),
    index("ai_bot_webhook_events_external_idx").on(
      table.provider,
      table.externalId,
      table.createdAt,
    ),
    check(
      "ai_bot_webhook_events_provider_check",
      sql`${table.provider} in ('telegram', 'vk')`,
    ),
    check(
      "ai_bot_webhook_events_status_check",
      sql`${table.status} in ('received', 'processing', 'succeeded', 'failed')`,
    ),
    check("ai_bot_webhook_events_attempts_check", sql`${table.attempts} > 0`),
  ],
);
