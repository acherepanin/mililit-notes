import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ActivityService } from '../activity/activity.service';
import { DatabaseService } from '../infra/database.service';
import { AiCryptoService } from './ai-crypto.service';
import { AiModelCatalogService } from './ai-model-catalog.service';
import { calculateAiUsageCostUsd } from './ai-pricing';
import { AiToolsService } from './ai-tools.service';
import type { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import type { SendAiMessageDto } from './dto/send-ai-message.dto';
import type { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import type {
  AiChatMessage,
  AiChatResponse,
  AiMonthlyUsageResponse,
  AiModelResponse,
  AiModelRow,
  AiModelTier,
  AiProviderSettingsRow,
  AiSavedProviderResponse,
  AiSettingsResponse,
  AiSettingsRow,
  AiToolAction,
  AiToolExecutionResponse,
  AiUsageSummary,
  OpenAiCompatibleChatResponse,
  OpenAiCompatibleModelsResponse,
  OpenAiCompatibleTranscriptionResponse,
} from './ai.types';

const defaultProviderName = 'OpenAI-compatible';
const defaultBaseUrl = 'https://api.openai.com/v1';
const chatTimeoutMs = 45_000;
const modelsTimeoutMs = 20_000;
const transcriptionTimeoutMs = 60_000;
const modelSyncIntervalMs = 24 * 60 * 60 * 1000;
const defaultTranscriptionModel = 'whisper-1';
interface ConfiguredAiUserRow {
  user_id: number;
}

interface SyncedProviderModel {
  modelId: string;
  providerCreatedAt: number | null;
}

interface AiChatOptions {
  allowReadSecretsOverride?: boolean;
  allowedToolNames?: ReadonlySet<string>;
  requireActionConfirmationOverride?: boolean;
}

interface AiAudioTranscriptionInput {
  content: Buffer;
  fileName: string;
  mimeType: string;
}

@Injectable()
export class AiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiService.name);
  private modelSyncInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AiModelCatalogService) private readonly aiModelCatalogService: AiModelCatalogService,
    @Inject(AiToolsService) private readonly aiToolsService: AiToolsService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.modelSyncInterval = setInterval(() => {
      void this.syncModelsForConfiguredUsers();
    }, modelSyncIntervalMs);
    this.modelSyncInterval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.modelSyncInterval) {
      clearInterval(this.modelSyncInterval);
      this.modelSyncInterval = null;
    }
  }

  getSettings(userId: number): AiSettingsResponse {
    const settings = this.ensureSettings(userId);
    return this.mapSettings(settings, this.listModels(userId, settings.provider_name));
  }

  updateSettings(userId: number, dto: UpdateAiSettingsDto): AiSettingsResponse {
    const current = this.ensureSettings(userId);
    const now = new Date().toISOString();
    const nextProvider = this.normalizeText(dto.providerName, current.provider_name);
    const nextBaseUrl = dto.baseUrl
      ? this.normalizeBaseUrl(dto.baseUrl)
      : this.normalizeBaseUrl(current.base_url);
    const providerSettings = this.ensureProviderSettings(userId, nextProvider, nextBaseUrl);
    const nextModel =
      dto.model === null ? null : this.normalizeNullableText(dto.model, providerSettings.model);
    const updates: Record<string, unknown> = {
      userId,
      enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
      allowReadSecrets:
        dto.allowReadSecrets === undefined
          ? current.allow_read_secrets
          : dto.allowReadSecrets
            ? 1
            : 0,
      requireActionConfirmation:
        dto.requireActionConfirmation === undefined
          ? current.require_action_confirmation
          : dto.requireActionConfirmation
            ? 1
            : 0,
      dailyRequestLimit: this.normalizeLimit(dto.dailyRequestLimit, current.daily_request_limit),
      dailyTokenLimit: this.normalizeLimit(dto.dailyTokenLimit, current.daily_token_limit),
      providerName: nextProvider,
      baseUrl: nextBaseUrl,
      model: nextModel,
      now,
    };
    const providerAssignments = ['model = @model', 'updated_at = @now'];

    if (dto.clearApiKey) {
      providerAssignments.push(
        'api_key_encrypted = NULL',
        'api_key_hint = NULL',
        'api_key_updated_at = NULL',
      );
    } else if (dto.apiKey?.trim()) {
      updates.apiKeyEncrypted = this.aiCryptoService.encrypt(dto.apiKey.trim());
      updates.apiKeyHint = this.aiCryptoService.createHint(dto.apiKey.trim());
      providerAssignments.push(
        'api_key_encrypted = @apiKeyEncrypted',
        'api_key_hint = @apiKeyHint',
        'api_key_updated_at = @now',
      );
    }

    const transaction = this.databaseService.connection.transaction(() => {
      this.databaseService.connection
        .prepare(
          `
            UPDATE ai_user_settings
            SET enabled = @enabled,
                allow_read_secrets = @allowReadSecrets,
                require_action_confirmation = @requireActionConfirmation,
                daily_request_limit = @dailyRequestLimit,
                daily_token_limit = @dailyTokenLimit,
                provider_name = @providerName,
                base_url = @baseUrl,
                updated_at = @now
            WHERE user_id = @userId
          `,
        )
        .run(updates);

      this.databaseService.connection
        .prepare(
          `
            UPDATE ai_provider_settings
            SET ${providerAssignments.join(', ')}
            WHERE user_id = @userId
              AND provider_name = @providerName
              AND base_url = @baseUrl
          `,
        )
        .run(updates);
    });

    transaction();

    this.activityService.record({
      actorId: userId,
      userId,
      action: 'ai.settings.update',
      targetType: 'ai_settings',
      targetId: userId,
      details: {
        enabled: Boolean(updates.enabled),
        allowReadSecrets: Boolean(updates.allowReadSecrets),
        requireActionConfirmation: Boolean(updates.requireActionConfirmation),
        providerName: nextProvider,
        model: nextModel,
      },
    });

    return this.getSettings(userId);
  }

  async syncModels(userId: number): Promise<AiSettingsResponse> {
    const settings = this.ensureSettings(userId);
    const apiKey = this.getApiKey(settings);
    const url = this.buildProviderUrl(settings.base_url, 'models');
    const now = new Date().toISOString();

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(modelsTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}`);
      }

      const payload = (await response.json()) as OpenAiCompatibleModelsResponse;
      const models = (payload.data ?? [])
        .map((model): SyncedProviderModel | null =>
          typeof model.id === 'string' && model.id.trim()
            ? {
                modelId: model.id.trim(),
                providerCreatedAt: this.aiModelCatalogService.normalizeProviderCreatedAt(
                  model.created,
                ),
              }
            : null,
        )
        .filter((model): model is SyncedProviderModel => Boolean(model));

      this.upsertModels(userId, settings.provider_name, models, now);
      this.updateSyncState(userId, settings.provider_name, settings.base_url, 'ok', null, now);
    } catch (caught) {
      const message = (caught as Error).message || 'Failed to sync models';
      this.updateSyncState(
        userId,
        settings.provider_name,
        settings.base_url,
        'error',
        message,
        now,
      );
      this.logger.warn(`AI models sync failed for user ${userId}: ${message}`);
      throw new BadRequestException(message);
    }

    return this.getSettings(userId);
  }

  async testConnection(userId: number): Promise<{ ok: boolean; checkedAt: string }> {
    await this.syncModels(userId);
    const settings = this.ensureSettings(userId);
    const checkedAt = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_provider_settings
          SET last_connection_check_at = @checkedAt,
              last_connection_check_status = 'ok',
              updated_at = @checkedAt
          WHERE user_id = @userId
            AND provider_name = @providerName
            AND base_url = @baseUrl
        `,
      )
      .run({
        userId,
        providerName: settings.provider_name,
        baseUrl: settings.base_url,
        checkedAt,
      });

    return { ok: true, checkedAt };
  }

  getMonthlyUsage(userId: number): AiMonthlyUsageResponse {
    const { monthStart, monthEnd } = this.getCurrentMonthRange();
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT
            ai_usage_logs.provider_name as providerName,
            ai_usage_logs.model,
            COUNT(*) as requests,
            COALESCE(SUM(input_tokens), 0) as inputTokens,
            COALESCE(SUM(output_tokens), 0) as outputTokens,
            MAX(ai_provider_models.input_price_per_1m) as inputPricePer1M,
            MAX(ai_provider_models.cached_input_price_per_1m) as cachedInputPricePer1M,
            MAX(ai_provider_models.output_price_per_1m) as outputPricePer1M
          FROM ai_usage_logs
          LEFT JOIN ai_provider_models
            ON ai_provider_models.user_id = ai_usage_logs.user_id
           AND ai_provider_models.provider_name = ai_usage_logs.provider_name
           AND ai_provider_models.model_id = ai_usage_logs.model
          WHERE ai_usage_logs.user_id = @userId
            AND ai_usage_logs.created_at >= @monthStart
            AND ai_usage_logs.created_at < @monthEnd
          GROUP BY ai_usage_logs.provider_name, ai_usage_logs.model
          ORDER BY requests DESC, lower(ai_usage_logs.model) ASC
        `,
      )
      .all({ userId, monthStart, monthEnd }) as Array<{
      providerName: string;
      model: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      inputPricePer1M: number | null;
      cachedInputPricePer1M: number | null;
      outputPricePer1M: number | null;
    }>;
    let knownCostUsd = 0;
    let hasUnknownCost = false;
    let requests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const models = rows.map((row) => {
      const fallbackPricing = this.aiModelCatalogService.getPricing(row.model);
      const pricing = {
        inputPricePer1M: row.inputPricePer1M ?? fallbackPricing.inputPricePer1M,
        cachedInputPricePer1M: row.cachedInputPricePer1M ?? fallbackPricing.cachedInputPricePer1M,
        outputPricePer1M: row.outputPricePer1M ?? fallbackPricing.outputPricePer1M,
      };
      const costUsd = calculateAiUsageCostUsd(row.inputTokens, row.outputTokens, pricing);

      requests += row.requests;
      inputTokens += row.inputTokens;
      outputTokens += row.outputTokens;

      if (costUsd === null) {
        hasUnknownCost = true;
      } else {
        knownCostUsd += costUsd;
      }

      return {
        ...row,
        tokens: row.inputTokens + row.outputTokens,
        costUsd,
        ...pricing,
      };
    });

    return {
      monthStart,
      monthEnd,
      requests,
      inputTokens,
      outputTokens,
      tokens: inputTokens + outputTokens,
      knownCostUsd,
      hasUnknownCost,
      models,
    };
  }

  private async syncModelsForConfiguredUsers(): Promise<void> {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT user_settings.user_id
          FROM ai_user_settings user_settings
          JOIN ai_provider_settings provider_settings
            ON provider_settings.user_id = user_settings.user_id
           AND provider_settings.provider_name = user_settings.provider_name
           AND provider_settings.base_url = user_settings.base_url
          WHERE user_settings.enabled = 1
            AND provider_settings.api_key_encrypted IS NOT NULL
            AND trim(provider_settings.api_key_encrypted) != ''
          ORDER BY user_settings.user_id ASC
        `,
      )
      .all() as ConfiguredAiUserRow[];

    for (const row of rows) {
      try {
        await this.syncModels(row.user_id);
      } catch (caught) {
        this.logger.warn(
          `Scheduled AI models sync failed for user ${row.user_id}: ${(caught as Error).message}`,
        );
      }
    }
  }

  async chat(
    userId: number,
    dto: SendAiMessageDto,
    options: AiChatOptions = {},
  ): Promise<AiChatResponse> {
    const settings = this.ensureSettings(userId);

    if (!settings.enabled) {
      throw new BadRequestException('AI assistant is disabled');
    }

    const apiKey = this.getApiKey(settings);
    const model = settings.model?.trim();
    const allowReadSecrets =
      options.allowReadSecretsOverride ?? Boolean(settings.allow_read_secrets);

    if (!model) {
      throw new BadRequestException('AI model is not selected');
    }

    if (this.isBareConfirmation(dto.message)) {
      this.enforceUsageLimits(userId, settings, this.estimateTokens(dto.message));
      this.recordAiUsage(
        userId,
        settings.provider_name,
        model,
        this.estimateTokens(dto.message),
        0,
      );
      this.recordChatActivity(userId, model, dto.message.length);
      return {
        message: {
          role: 'assistant',
          content:
            'Уточните действие явно: например "переименуй текущую заметку в Test" или нажмите кнопку подтверждения в карточке действия.',
        },
      };
    }

    const currentNote = this.normalizeCurrentNote(dto.currentNote);
    const safeCurrentNote = this.prepareCurrentNoteForModel(currentNote, allowReadSecrets);
    const messages: AiChatMessage[] = [
      {
        role: 'developer',
        content: [
          'You are an assistant inside a private notes app. Answer briefly and clearly.',
          'Do not claim that you changed notes unless a tool result says so.',
          this.aiToolsService.getToolInstructions({
            allowReadSecrets,
            requireActionConfirmation: Boolean(settings.require_action_confirmation),
            allowedToolNames: options.allowedToolNames,
          }),
          this.buildCurrentNotePrompt(safeCurrentNote, allowReadSecrets),
        ].join(' '),
      },
      ...this.normalizeHistory(dto.history),
      { role: 'user', content: dto.message.trim() },
    ];
    const estimatedInputTokens = this.estimateMessagesTokens(messages);
    this.enforceUsageLimits(userId, settings, estimatedInputTokens);
    const tools = this.aiToolsService.getOpenAiTools(options.allowedToolNames);
    const response = await fetch(this.buildProviderUrl(settings.base_url, 'chat/completions'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: AbortSignal.timeout(chatTimeoutMs),
    });

    if (!response.ok) {
      const providerMessage = await this.readProviderError(response);
      throw new BadRequestException(
        providerMessage
          ? `AI provider returned ${response.status}: ${providerMessage}`
          : `AI provider returned ${response.status}`,
      );
    }

    const payload = (await response.json()) as OpenAiCompatibleChatResponse;
    const inputTokens = this.readTokenUsage(payload.usage?.prompt_tokens) ?? estimatedInputTokens;
    const outputTokens = this.readTokenUsage(payload.usage?.completion_tokens) ?? 0;
    const toolCalls = this.aiToolsService.parseToolCalls(payload.choices?.[0]?.message?.tool_calls);
    const toolCallUsages = toolCalls.map((toolCall) => ({
      name: toolCall.name,
      mode: this.safeGetToolMode(toolCall.name),
    }));

    if (toolCalls.length > 0) {
      const results = await Promise.all(
        toolCalls.map(async (toolCall) =>
          this.aiToolsService
            .handleToolCall(userId, toolCall, {
              allowReadSecrets,
              allowedToolNames: options.allowedToolNames,
            })
            .catch((caught: unknown) => ({
              message: {
                role: 'assistant' as const,
                content: this.formatToolCallError(toolCall.name, caught),
              },
            })),
        ),
      );
      const actions = results.flatMap((result) =>
        'action' in result && result.action ? [result.action] : [],
      );
      const shouldConfirmActions =
        options.requireActionConfirmationOverride ?? Boolean(settings.require_action_confirmation);

      this.recordAiUsage(userId, settings.provider_name, model, inputTokens, outputTokens);
      this.recordChatActivity(userId, model, dto.message.length);

      if (!shouldConfirmActions && actions.length > 0) {
        const executions: AiToolExecutionResponse[] = [];
        const readonlyMessages = results
          .filter((result) => !('action' in result && result.action))
          .map((result) => result.message.content);
        const executionMessages: string[] = [];

        for (const action of actions) {
          try {
            const execution = this.aiToolsService.executeAction(
              userId,
              action.name,
              action.payload,
              options.allowedToolNames,
            );
            executions.push(execution);
            executionMessages.push(execution.message.content);
          } catch (caught) {
            executionMessages.push(this.formatToolExecutionError(action, caught));
          }
        }

        return {
          message: {
            role: 'assistant',
            content: [...readonlyMessages, ...executionMessages].join('\n\n'),
          },
          executions: executions.length > 0 ? executions : undefined,
          toolCalls: toolCallUsages,
        };
      }

      return {
        message: {
          role: 'assistant',
          content: results.map((result) => result.message.content).join('\n\n'),
        },
        actions: actions.length > 0 ? actions : undefined,
        toolCalls: toolCallUsages,
      };
    }

    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      throw new BadRequestException('AI provider returned an empty response');
    }

    this.recordAiUsage(
      userId,
      settings.provider_name,
      model,
      inputTokens,
      this.readTokenUsage(payload.usage?.completion_tokens) ?? this.estimateTokens(content),
    );
    this.recordChatActivity(userId, model, dto.message.length);

    return { message: { role: 'assistant', content: content.trim() } };
  }

  async transcribeAudio(userId: number, audio: AiAudioTranscriptionInput): Promise<string> {
    const settings = this.ensureSettings(userId);

    if (!settings.enabled) {
      throw new BadRequestException('AI assistant is disabled');
    }

    const apiKey = this.getApiKey(settings);
    const model =
      this.configService.get<string>('AI_TRANSCRIPTION_MODEL')?.trim() || defaultTranscriptionModel;
    const formData = new FormData();
    const audioBytes = new Uint8Array(audio.content);

    formData.append('model', model);
    formData.append('file', new Blob([audioBytes], { type: audio.mimeType }), audio.fileName);
    this.enforceUsageLimits(userId, settings, 0);

    const response = await fetch(this.buildProviderUrl(settings.base_url, 'audio/transcriptions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(transcriptionTimeoutMs),
    });

    if (!response.ok) {
      const providerMessage = await this.readProviderError(response);
      throw new BadRequestException(
        providerMessage
          ? `AI transcription returned ${response.status}: ${providerMessage}`
          : `AI transcription returned ${response.status}`,
      );
    }

    const payload = (await response.json()) as OpenAiCompatibleTranscriptionResponse;
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';

    if (!text) {
      throw new BadRequestException('AI transcription returned empty text');
    }

    const inputTokens = this.readTokenUsage(payload.usage?.input_tokens) ?? 0;
    const outputTokens =
      this.readTokenUsage(payload.usage?.output_tokens) ?? this.estimateTokens(text);
    this.recordAiUsage(userId, settings.provider_name, model, inputTokens, outputTokens);

    return text;
  }

  executeAction(
    userId: number,
    dto: ExecuteAiToolDto,
    options: Pick<AiChatOptions, 'allowedToolNames'> = {},
  ): AiToolExecutionResponse {
    return this.aiToolsService.executeAction(
      userId,
      dto.name,
      dto.payload,
      options.allowedToolNames,
    );
  }

  private recordChatActivity(userId: number, model: string, messageLength: number): void {
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'ai.chat',
      targetType: 'ai',
      targetId: userId,
      details: { model, messageLength },
    });
  }

  private recordAiUsage(
    userId: number,
    providerName: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO ai_usage_logs
            (user_id, provider_name, model, input_tokens, output_tokens, created_at)
          VALUES (@userId, @providerName, @model, @inputTokens, @outputTokens, @createdAt)
        `,
      )
      .run({
        userId,
        providerName,
        model,
        inputTokens: Math.max(0, Math.trunc(inputTokens)),
        outputTokens: Math.max(0, Math.trunc(outputTokens)),
        createdAt: new Date().toISOString(),
      });
  }

  private enforceUsageLimits(
    userId: number,
    settings: AiSettingsRow,
    nextInputTokens: number,
  ): void {
    const usage = this.getUsageToday(userId);

    if (settings.daily_request_limit !== null && usage.requests >= settings.daily_request_limit) {
      throw new BadRequestException('Daily AI request limit is reached');
    }

    if (
      settings.daily_token_limit !== null &&
      usage.tokens + nextInputTokens > settings.daily_token_limit
    ) {
      throw new BadRequestException('Daily AI token limit is reached');
    }
  }

  private getUsageToday(userId: number): AiUsageSummary {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT
            COUNT(*) as requests,
            COALESCE(SUM(input_tokens), 0) as inputTokens,
            COALESCE(SUM(output_tokens), 0) as outputTokens
          FROM ai_usage_logs
          WHERE user_id = @userId AND created_at >= @dayStart
        `,
      )
      .get({ userId, dayStart: dayStart.toISOString() }) as
      | { requests: number; inputTokens: number; outputTokens: number }
      | undefined;
    const inputTokens = row?.inputTokens ?? 0;
    const outputTokens = row?.outputTokens ?? 0;

    return {
      requests: row?.requests ?? 0,
      inputTokens,
      outputTokens,
      tokens: inputTokens + outputTokens,
    };
  }

  private getCurrentMonthRange(): { monthStart: string; monthEnd: string } {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    return { monthStart: start.toISOString(), monthEnd: end.toISOString() };
  }

  private ensureSettings(userId: number): AiSettingsRow {
    const existing = this.getActiveSettings(userId);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO ai_user_settings
            (user_id, enabled, allow_read_secrets, require_action_confirmation, provider_name, base_url, created_at, updated_at)
          VALUES (@userId, 0, 0, 1, @providerName, @baseUrl, @now, @now)
        `,
      )
      .run({ userId, providerName: defaultProviderName, baseUrl: defaultBaseUrl, now });

    this.ensureProviderSettings(userId, defaultProviderName, defaultBaseUrl);

    return this.getActiveSettings(userId) as AiSettingsRow;
  }

  private getActiveSettings(userId: number): AiSettingsRow | undefined {
    const active = this.databaseService.connection
      .prepare(
        `
          SELECT
            user_settings.user_id,
            user_settings.enabled,
            user_settings.allow_read_secrets,
            user_settings.require_action_confirmation,
            user_settings.daily_request_limit,
            user_settings.daily_token_limit,
            user_settings.provider_name,
            user_settings.base_url,
            provider_settings.model,
            provider_settings.api_key_encrypted,
            provider_settings.api_key_hint,
            provider_settings.api_key_updated_at,
            provider_settings.last_connection_check_at,
            provider_settings.last_connection_check_status,
            provider_settings.last_models_sync_at,
            provider_settings.models_sync_status,
            provider_settings.models_sync_error,
            user_settings.created_at,
            user_settings.updated_at
          FROM ai_user_settings user_settings
          LEFT JOIN ai_provider_settings provider_settings
            ON provider_settings.user_id = user_settings.user_id
           AND provider_settings.provider_name = user_settings.provider_name
           AND provider_settings.base_url = user_settings.base_url
          WHERE user_settings.user_id = ?
        `,
      )
      .get(userId) as AiSettingsRow | undefined;

    if (!active) {
      return undefined;
    }

    if (active.model === undefined) {
      this.ensureProviderSettings(userId, active.provider_name, active.base_url);
      return this.getActiveSettings(userId);
    }

    return active;
  }

  private ensureProviderSettings(
    userId: number,
    providerName: string,
    baseUrl: string,
  ): AiProviderSettingsRow {
    const existing = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM ai_provider_settings
          WHERE user_id = @userId
            AND provider_name = @providerName
            AND base_url = @baseUrl
        `,
      )
      .get({ userId, providerName, baseUrl }) as AiProviderSettingsRow | undefined;

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO ai_provider_settings
            (user_id, provider_name, base_url, created_at, updated_at)
          VALUES (@userId, @providerName, @baseUrl, @now, @now)
        `,
      )
      .run({ userId, providerName, baseUrl, now });

    return this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM ai_provider_settings
          WHERE user_id = @userId
            AND provider_name = @providerName
            AND base_url = @baseUrl
        `,
      )
      .get({ userId, providerName, baseUrl }) as AiProviderSettingsRow;
  }

  private listModels(userId: number, providerName: string): AiModelResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT * FROM ai_provider_models
          WHERE user_id = @userId AND provider_name = @providerName
        `,
      )
      .all({ userId, providerName }) as AiModelRow[];

    return rows
      .map((row) => {
        const classification = this.aiModelCatalogService.classifyModel(row.model_id);
        const providerCreatedAt = this.aiModelCatalogService.normalizeProviderCreatedAt(
          row.provider_created_at,
        );
        const fallbackPricing = this.aiModelCatalogService.getPricing(row.model_id);

        return {
          id: row.model_id,
          label: row.label,
          ...classification,
          inputPricePer1M: row.input_price_per_1m ?? fallbackPricing.inputPricePer1M,
          cachedInputPricePer1M:
            row.cached_input_price_per_1m ?? fallbackPricing.cachedInputPricePer1M,
          outputPricePer1M: row.output_price_per_1m ?? fallbackPricing.outputPricePer1M,
          sortRank: this.aiModelCatalogService.createSortRank(
            row.model_id,
            classification.sortRank,
            providerCreatedAt,
          ),
          capabilities: this.parseCapabilities(row.capabilities),
          isDeprecated: Boolean(row.is_deprecated),
        };
      })
      .sort((left, right) => {
        if (left.isDeprecated !== right.isDeprecated) {
          return left.isDeprecated ? 1 : -1;
        }

        if (left.tier !== right.tier) {
          const order: Record<AiModelTier, number> = { paid: 0, free: 1, unknown: 2 };
          return order[left.tier] - order[right.tier];
        }

        return (
          right.sortRank - left.sortRank ||
          right.score - left.score ||
          left.label.localeCompare(right.label)
        );
      });
  }

  private upsertModels(
    userId: number,
    providerName: string,
    models: SyncedProviderModel[],
    now: string,
  ): void {
    const uniqueModels = [...new Map(models.map((model) => [model.modelId, model])).values()];
    const transaction = this.databaseService.connection.transaction(() => {
      this.databaseService.connection
        .prepare(
          `
            UPDATE ai_provider_models
            SET is_deprecated = 1, updated_at = @now
            WHERE user_id = @userId AND provider_name = @providerName
          `,
        )
        .run({ userId, providerName, now });

      const statement = this.databaseService.connection.prepare(
        `
          INSERT INTO ai_provider_models
            (user_id, provider_name, model_id, label, tier, quality, speed, cost, capabilities,
             input_price_per_1m, cached_input_price_per_1m, output_price_per_1m,
             provider_created_at, is_deprecated, last_seen_at, created_at, updated_at)
          VALUES
            (@userId, @providerName, @modelId, @label, @tier, @quality, @speed, @cost,
             @capabilities, @inputPricePer1M, @cachedInputPricePer1M, @outputPricePer1M,
             @providerCreatedAt, 0, @now, @now, @now)
          ON CONFLICT(user_id, provider_name, model_id) DO UPDATE SET
            label = excluded.label,
            tier = excluded.tier,
            quality = excluded.quality,
            speed = excluded.speed,
            cost = excluded.cost,
            capabilities = excluded.capabilities,
            input_price_per_1m = excluded.input_price_per_1m,
            cached_input_price_per_1m = excluded.cached_input_price_per_1m,
            output_price_per_1m = excluded.output_price_per_1m,
            provider_created_at = COALESCE(excluded.provider_created_at, ai_provider_models.provider_created_at),
            is_deprecated = 0,
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at
        `,
      );

      for (const model of uniqueModels) {
        const pricing = this.aiModelCatalogService.getPricing(model.modelId);
        statement.run({
          userId,
          providerName,
          modelId: model.modelId,
          label: model.modelId,
          ...this.aiModelCatalogService.classifyModel(model.modelId),
          inputPricePer1M: pricing.inputPricePer1M,
          cachedInputPricePer1M: pricing.cachedInputPricePer1M,
          outputPricePer1M: pricing.outputPricePer1M,
          capabilities: JSON.stringify(['chat']),
          providerCreatedAt: model.providerCreatedAt,
          now,
        });
      }
    });

    transaction();
  }

  private updateSyncState(
    userId: number,
    providerName: string,
    baseUrl: string,
    status: 'ok' | 'error',
    error: string | null,
    syncedAt: string,
  ): void {
    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_provider_settings
          SET last_models_sync_at = @syncedAt,
              models_sync_status = @status,
              models_sync_error = @error,
              updated_at = @syncedAt
          WHERE user_id = @userId
            AND provider_name = @providerName
            AND base_url = @baseUrl
        `,
      )
      .run({ userId, providerName, baseUrl, status, error, syncedAt });
  }

  private mapSettings(settings: AiSettingsRow, models: AiModelResponse[]): AiSettingsResponse {
    return {
      enabled: Boolean(settings.enabled),
      allowReadSecrets: Boolean(settings.allow_read_secrets),
      requireActionConfirmation: Boolean(settings.require_action_confirmation),
      dailyRequestLimit: settings.daily_request_limit,
      dailyTokenLimit: settings.daily_token_limit,
      usageToday: this.getUsageToday(settings.user_id),
      providerName: settings.provider_name,
      baseUrl: settings.base_url,
      model: settings.model,
      hasApiKey: Boolean(settings.api_key_encrypted),
      apiKeyHint: settings.api_key_hint,
      apiKeyUpdatedAt: settings.api_key_updated_at,
      lastConnectionCheckAt: settings.last_connection_check_at,
      lastConnectionCheckStatus: settings.last_connection_check_status,
      lastModelsSyncAt: settings.last_models_sync_at,
      modelsSyncStatus: settings.models_sync_status,
      modelsSyncError: settings.models_sync_error,
      models,
      providers: this.listSavedProviders(settings.user_id),
    };
  }

  private listSavedProviders(userId: number): AiSavedProviderResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM ai_provider_settings
          WHERE user_id = @userId
          ORDER BY updated_at DESC, id DESC
        `,
      )
      .all({ userId }) as AiProviderSettingsRow[];

    return rows.map((row) => ({
      providerName: row.provider_name,
      baseUrl: row.base_url,
      model: row.model,
      hasApiKey: Boolean(row.api_key_encrypted),
      apiKeyHint: row.api_key_hint,
      apiKeyUpdatedAt: row.api_key_updated_at,
      updatedAt: row.updated_at,
    }));
  }

  private normalizeHistory(history?: SendAiMessageDto['history']): AiChatMessage[] {
    return (history ?? [])
      .filter(
        (message): message is { role: 'user' | 'assistant'; content: string } =>
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          Boolean(message.content.trim()),
      )
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 8000) }));
  }

  private normalizeCurrentNote(currentNote: SendAiMessageDto['currentNote']): {
    id: number;
    name: string;
    contentHtml: string;
    contentText: string;
  } | null {
    if (!currentNote || typeof currentNote.id !== 'number' || !Number.isInteger(currentNote.id)) {
      return null;
    }

    return {
      id: currentNote.id,
      name: typeof currentNote.name === 'string' ? currentNote.name.slice(0, 160) : '',
      contentHtml:
        typeof currentNote.contentHtml === 'string' ? currentNote.contentHtml.slice(0, 50_000) : '',
      contentText:
        typeof currentNote.contentText === 'string' ? currentNote.contentText.slice(0, 4000) : '',
    };
  }

  private prepareCurrentNoteForModel(
    currentNote: { id: number; name: string; contentHtml: string; contentText: string } | null,
    allowReadSecrets: boolean,
  ): { id: number; name: string; contentHtml: string; contentText: string } | null {
    if (!currentNote || allowReadSecrets) {
      return currentNote;
    }

    return {
      ...currentNote,
      contentHtml: this.redactSecretHtml(currentNote.contentHtml),
      contentText: this.redactSecretText(currentNote.contentText),
    };
  }

  private buildCurrentNotePrompt(
    currentNote: { id: number; name: string; contentHtml: string; contentText: string } | null,
    allowReadSecrets: boolean,
  ): string {
    if (!currentNote) {
      return [
        'CURRENT NOTE CONTEXT:',
        'No note is currently selected.',
        'If the user names a note, search by that name and read the matched note before editing or answering from its content.',
      ].join('\n');
    }

    return [
      'CURRENT NOTE CONTEXT:',
      `noteId=${currentNote.id}`,
      `id=${currentNote.id}`,
      `name="${this.escapePromptText(currentNote.name, 180)}"`,
      'For all note tools use noteId exactly as shown above when the user says current, selected, opened, this, already created note.',
      allowReadSecrets
        ? 'Secret values are included because the user enabled AI secret access.'
        : 'Secret/password/token values are redacted because AI secret access is disabled.',
      'Plain text snapshot for reading/searching inside the current note:',
      `<contentText>${this.escapePromptText(currentNote.contentText, 6000)}</contentText>`,
      'HTML snapshot for preserving editor formatting during updates:',
      `<contentHtml>${this.escapePromptText(currentNote.contentHtml, 12000)}</contentHtml>`,
    ].join('\n');
  }

  private escapePromptText(value: string, limit: number): string {
    return value
      .slice(0, limit)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private formatToolExecutionError(action: AiToolAction, caught: unknown): string {
    const message = caught instanceof Error && caught.message ? caught.message : 'unknown error';
    return `Не удалось выполнить "${action.title}": ${message}.`;
  }

  private formatToolCallError(name: string, caught: unknown): string {
    const message = caught instanceof Error && caught.message ? caught.message : 'unknown error';
    return `Не удалось подготовить действие "${name}": ${message}.`;
  }

  private safeGetToolMode(name: string): 'readonly' | 'mutation' {
    try {
      return this.aiToolsService.getToolMode(name);
    } catch {
      return 'readonly';
    }
  }

  private redactSecretHtml(value: string): string {
    return value.replace(
      /(<[^>]*data-copy-field[^>]*(?:data-secret="true"|data-kind="(?:password|token|credential)")|<[^>]*(?:data-secret="true"|data-kind="(?:password|token|credential)")[^>]*data-copy-field[^>]*)([^>]*data-value=")[^"]*("[^>]*>)/gi,
      '$1$2[secret hidden]$3',
    );
  }

  private redactSecretText(value: string): string {
    return value.replace(
      /\b(password|пароль|token|токен|api[-_\s]?key|secret|секрет)\b\s*[:=-]\s*[^\n,;]+/gi,
      (match, label: string) => `${label}: [secret hidden]`,
    );
  }

  private isBareConfirmation(message: string): boolean {
    return /^(да|yes|ok|ок|ага|угу)$/i.test(message.trim());
  }

  private getApiKey(settings: AiSettingsRow): string {
    const apiKey = this.aiCryptoService.decrypt(settings.api_key_encrypted);

    if (!apiKey) {
      throw new BadRequestException('AI API key is not configured or cannot be decrypted');
    }

    return apiKey;
  }

  private normalizeText(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim();
    return trimmed || fallback;
  }

  private normalizeNullableText(
    value: string | null | undefined,
    fallback: string | null,
  ): string | null {
    if (value === undefined) {
      return fallback;
    }

    const trimmed = value?.trim();
    return trimmed || null;
  }

  private normalizeLimit(value: number | null | undefined, fallback: number | null): number | null {
    if (value === undefined) {
      return fallback;
    }

    if (value === null) {
      return null;
    }

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private estimateMessagesTokens(messages: AiChatMessage[]): number {
    return this.estimateTokens(messages.map((message) => message.content).join('\n'));
  }

  private estimateTokens(value: string): number {
    return Math.ceil(value.length / 4);
  }

  private readTokenUsage(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.trunc(value)
      : null;
  }

  private normalizeBaseUrl(value: string): string {
    try {
      const url = new URL(value.trim());

      if (url.protocol !== 'https:') {
        throw new Error('Only HTTPS providers are allowed');
      }

      return url.href.replace(/\/+$/, '');
    } catch {
      throw new BadRequestException('AI provider base URL must be a valid HTTPS URL');
    }
  }

  private buildProviderUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  private async readProviderError(response: Response): Promise<string | null> {
    try {
      const payload = (await response.json()) as unknown;

      if (this.hasProviderErrorMessage(payload)) {
        return payload.error.message.slice(0, 300);
      }

      if (this.hasMessage(payload)) {
        return payload.message.slice(0, 300);
      }
    } catch {
      return null;
    }

    return null;
  }

  private hasProviderErrorMessage(payload: unknown): payload is { error: { message: string } } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
    );
  }

  private hasMessage(payload: unknown): payload is { message: string } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
    );
  }

  private parseCapabilities(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
