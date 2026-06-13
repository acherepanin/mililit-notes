import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { redactSecretHtml, redactSecretText } from '../common/secret-redaction.util';
import { currentMonthRangeIso, nowIso } from '../database/db.util';
import {
  AiProviderModelEntity,
  AiProviderSettingsEntity,
  AiUsageLogEntity,
  AiUserSettingsEntity,
} from '../database/entities/ai.entity';
import { EntitlementsService } from '../subscriptions/entitlements.service';
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
    @InjectRepository(AiUserSettingsEntity)
    private readonly userSettingsRepo: Repository<AiUserSettingsEntity>,
    @InjectRepository(AiProviderSettingsEntity)
    private readonly providerSettingsRepo: Repository<AiProviderSettingsEntity>,
    @InjectRepository(AiProviderModelEntity)
    private readonly providerModelsRepo: Repository<AiProviderModelEntity>,
    @InjectRepository(AiUsageLogEntity)
    private readonly usageRepo: Repository<AiUsageLogEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AiModelCatalogService) private readonly aiModelCatalogService: AiModelCatalogService,
    @Inject(AiToolsService) private readonly aiToolsService: AiToolsService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
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

  async getSettings(userId: number): Promise<AiSettingsResponse> {
    const settings = await this.ensureSettings(userId);
    return this.mapSettings(settings, await this.listModels(userId, settings.provider_name));
  }

  async updateSettings(userId: number, dto: UpdateAiSettingsDto): Promise<AiSettingsResponse> {
    const current = await this.ensureSettings(userId);
    const now = nowIso();
    const nextProvider = this.normalizeText(dto.providerName, current.provider_name);
    const nextBaseUrl = dto.baseUrl
      ? this.normalizeBaseUrl(dto.baseUrl)
      : this.normalizeBaseUrl(current.base_url);
    const providerSettings = await this.ensureProviderSettings(userId, nextProvider, nextBaseUrl);
    const nextModel =
      dto.model === null ? null : this.normalizeNullableText(dto.model, providerSettings.model);

    const userUpdates: Partial<AiUserSettingsEntity> = {
      enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
      allow_read_secrets:
        dto.allowReadSecrets === undefined
          ? current.allow_read_secrets
          : dto.allowReadSecrets
            ? 1
            : 0,
      require_action_confirmation:
        dto.requireActionConfirmation === undefined
          ? current.require_action_confirmation
          : dto.requireActionConfirmation
            ? 1
            : 0,
      daily_request_limit: this.normalizeLimit(dto.dailyRequestLimit, current.daily_request_limit),
      daily_token_limit: this.normalizeLimit(dto.dailyTokenLimit, current.daily_token_limit),
      provider_name: nextProvider,
      base_url: nextBaseUrl,
      updated_at: now,
    };

    const providerUpdates: Partial<AiProviderSettingsEntity> = {
      model: nextModel,
      updated_at: now,
    };

    if (dto.clearApiKey) {
      providerUpdates.api_key_encrypted = null;
      providerUpdates.api_key_hint = null;
      providerUpdates.api_key_updated_at = null;
    } else if (dto.apiKey?.trim()) {
      providerUpdates.api_key_encrypted = this.aiCryptoService.encrypt(dto.apiKey.trim());
      providerUpdates.api_key_hint = this.aiCryptoService.createHint(dto.apiKey.trim());
      providerUpdates.api_key_updated_at = now;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(AiUserSettingsEntity, { user_id: userId }, userUpdates);
      await manager.update(
        AiProviderSettingsEntity,
        { user_id: userId, provider_name: nextProvider, base_url: nextBaseUrl },
        providerUpdates,
      );
    });

    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'ai.settings.update',
      targetType: 'ai_settings',
      targetId: userId,
      details: {
        enabled: Boolean(userUpdates.enabled),
        allowReadSecrets: Boolean(userUpdates.allow_read_secrets),
        requireActionConfirmation: Boolean(userUpdates.require_action_confirmation),
        providerName: nextProvider,
        model: nextModel,
      },
    });

    return this.getSettings(userId);
  }

  async syncModels(userId: number): Promise<AiSettingsResponse> {
    const settings = await this.ensureSettings(userId);
    const apiKey = this.getApiKey(settings);
    const url = this.buildProviderUrl(settings.base_url, 'models');
    const now = nowIso();

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

      await this.upsertModels(userId, settings.provider_name, models, now);
      await this.updateSyncState(userId, settings.provider_name, settings.base_url, 'ok', null, now);
    } catch (caught) {
      const message = (caught as Error).message || 'Failed to sync models';
      await this.updateSyncState(
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
    const settings = await this.ensureSettings(userId);
    const checkedAt = nowIso();
    await this.providerSettingsRepo.update(
      {
        user_id: userId,
        provider_name: settings.provider_name,
        base_url: settings.base_url,
      },
      {
        last_connection_check_at: checkedAt,
        last_connection_check_status: 'ok',
        updated_at: checkedAt,
      },
    );

    return { ok: true, checkedAt };
  }

  async getMonthlyUsage(userId: number): Promise<AiMonthlyUsageResponse> {
    const { start: monthStart, end: monthEnd } = currentMonthRangeIso();
    const rawRows = (await this.dataSource.query(
      `
        SELECT
          ai_usage_logs.provider_name as "providerName",
          ai_usage_logs.model,
          COUNT(*)::int as requests,
          COALESCE(SUM(input_tokens), 0)::bigint as "inputTokens",
          COALESCE(SUM(output_tokens), 0)::bigint as "outputTokens",
          MAX(ai_provider_models.input_price_per_1m) as "inputPricePer1M",
          MAX(ai_provider_models.cached_input_price_per_1m) as "cachedInputPricePer1M",
          MAX(ai_provider_models.output_price_per_1m) as "outputPricePer1M"
        FROM ai_usage_logs
        LEFT JOIN ai_provider_models
          ON ai_provider_models.user_id = ai_usage_logs.user_id
         AND ai_provider_models.provider_name = ai_usage_logs.provider_name
         AND ai_provider_models.model_id = ai_usage_logs.model
        WHERE ai_usage_logs.user_id = $1
          AND ai_usage_logs.created_at >= $2
          AND ai_usage_logs.created_at < $3
        GROUP BY ai_usage_logs.provider_name, ai_usage_logs.model
        ORDER BY requests DESC, lower(ai_usage_logs.model) ASC
      `,
      [userId, monthStart, monthEnd],
    )) as Array<Record<string, unknown>>;
    const rows = rawRows.map((row) => ({
      providerName: String(row.providerName),
      model: String(row.model),
      requests: Number(row.requests ?? 0),
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      inputPricePer1M: row.inputPricePer1M === null ? null : Number(row.inputPricePer1M),
      cachedInputPricePer1M:
        row.cachedInputPricePer1M === null ? null : Number(row.cachedInputPricePer1M),
      outputPricePer1M: row.outputPricePer1M === null ? null : Number(row.outputPricePer1M),
    }));
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
    const rows = (await this.dataSource.query(
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
    )) as ConfiguredAiUserRow[];

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
    await this.entitlementsService.assertAiAccess(userId);
    const settings = await this.ensureSettings(userId);

    if (!settings.enabled) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI assistant is disabled',
        code: 'AI_DISABLED',
      });
    }

    const apiKey = this.getApiKey(settings);
    const defaultModel = await this.entitlementsService.getDefaultAiModel(userId);
    const model = settings.model?.trim() || defaultModel?.trim() || null;
    const allowReadSecrets =
      options.allowReadSecretsOverride ?? Boolean(settings.allow_read_secrets);

    if (!model) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI model is not selected',
        code: 'AI_MODEL_NOT_SELECTED',
      });
    }

    if (this.isBareConfirmation(dto.message)) {
      await this.entitlementsService.assertMonthlyAiTokenCapacity(
        userId,
        this.estimateTokens(dto.message),
      );
      await this.enforceUsageLimits(userId, settings, this.estimateTokens(dto.message));
      await this.recordAiUsage(
        userId,
        settings.provider_name,
        model,
        this.estimateTokens(dto.message),
        0,
      );
      await this.recordChatActivity(userId, model, dto.message.length);
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
    await this.entitlementsService.assertMonthlyAiTokenCapacity(userId, estimatedInputTokens);
    await this.enforceUsageLimits(userId, settings, estimatedInputTokens);
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

      await this.recordAiUsage(userId, settings.provider_name, model, inputTokens, outputTokens);
      await this.recordChatActivity(userId, model, dto.message.length);

      if (!shouldConfirmActions && actions.length > 0) {
        const executions: AiToolExecutionResponse[] = [];
        const readonlyMessages = results
          .filter((result) => !('action' in result && result.action))
          .map((result) => result.message.content);
        const executionMessages: string[] = [];

        for (const action of actions) {
          try {
            const execution = await this.aiToolsService.executeAction(
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
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI provider returned an empty response',
        code: 'AI_EMPTY_RESPONSE',
      });
    }

    await this.recordAiUsage(
      userId,
      settings.provider_name,
      model,
      inputTokens,
      this.readTokenUsage(payload.usage?.completion_tokens) ?? this.estimateTokens(content),
    );
    await this.recordChatActivity(userId, model, dto.message.length);

    return { message: { role: 'assistant', content: content.trim() } };
  }

  async transcribeAudio(userId: number, audio: AiAudioTranscriptionInput): Promise<string> {
    await this.entitlementsService.assertAiAccess(userId);
    const settings = await this.ensureSettings(userId);

    if (!settings.enabled) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI assistant is disabled',
        code: 'AI_DISABLED',
      });
    }

    const apiKey = this.getApiKey(settings);
    const model =
      this.configService.get<string>('AI_TRANSCRIPTION_MODEL')?.trim() || defaultTranscriptionModel;
    const formData = new FormData();
    const audioBytes = new Uint8Array(audio.content);

    formData.append('model', model);
    formData.append('file', new Blob([audioBytes], { type: audio.mimeType }), audio.fileName);
    await this.enforceUsageLimits(userId, settings, 0);
    await this.entitlementsService.assertMonthlyAiTokenCapacity(
      userId,
      this.estimateTokens(audio.fileName) + 512,
    );

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
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI transcription returned empty text',
        code: 'AI_EMPTY_RESPONSE',
      });
    }

    const inputTokens = this.readTokenUsage(payload.usage?.input_tokens) ?? 0;
    const outputTokens =
      this.readTokenUsage(payload.usage?.output_tokens) ?? this.estimateTokens(text);
    await this.entitlementsService.assertMonthlyAiTokenCapacity(userId, inputTokens + outputTokens);
    await this.recordAiUsage(userId, settings.provider_name, model, inputTokens, outputTokens);

    return text;
  }

  async executeAction(
    userId: number,
    dto: ExecuteAiToolDto,
    options: Pick<AiChatOptions, 'allowedToolNames'> = {},
  ): Promise<AiToolExecutionResponse> {
    await this.entitlementsService.assertAiAccess(userId);
    return this.aiToolsService.executeAction(
      userId,
      dto.name,
      dto.payload,
      options.allowedToolNames,
    );
  }

  private async recordChatActivity(
    userId: number,
    model: string,
    messageLength: number,
  ): Promise<void> {
    await this.activityService.record({
      actorId: userId,
      userId,
      action: 'ai.chat',
      targetType: 'ai',
      targetId: userId,
      details: { model, messageLength },
    });
  }

  private async recordAiUsage(
    userId: number,
    providerName: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await this.usageRepo.insert({
      user_id: userId,
      provider_name: providerName,
      model,
      input_tokens: Math.max(0, Math.trunc(inputTokens)),
      output_tokens: Math.max(0, Math.trunc(outputTokens)),
      created_at: nowIso(),
    });
  }

  private async enforceUsageLimits(
    userId: number,
    settings: AiSettingsRow,
    nextInputTokens: number,
  ): Promise<void> {
    const usage = await this.getUsageToday(userId);

    if (settings.daily_request_limit !== null && usage.requests >= settings.daily_request_limit) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Daily AI request limit is reached',
        code: 'AI_DAILY_REQUEST_LIMIT',
      });
    }

    if (
      settings.daily_token_limit !== null &&
      usage.tokens + nextInputTokens > settings.daily_token_limit
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Daily AI token limit is reached',
        code: 'AI_DAILY_TOKEN_LIMIT',
      });
    }
  }

  private async getUsageToday(userId: number): Promise<AiUsageSummary> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = (await this.dataSource.query(
      `
        SELECT
          COUNT(*)::int as requests,
          COALESCE(SUM(input_tokens), 0)::bigint as "inputTokens",
          COALESCE(SUM(output_tokens), 0)::bigint as "outputTokens"
        FROM ai_usage_logs
        WHERE user_id = $1 AND created_at >= $2
      `,
      [userId, dayStart.toISOString()],
    )) as Array<{ requests: unknown; inputTokens: unknown; outputTokens: unknown }>;
    const row = rows[0];
    const inputTokens = Number(row?.inputTokens ?? 0);
    const outputTokens = Number(row?.outputTokens ?? 0);

    return {
      requests: Number(row?.requests ?? 0),
      inputTokens,
      outputTokens,
      tokens: inputTokens + outputTokens,
    };
  }

  private async ensureSettings(userId: number): Promise<AiSettingsRow> {
    const existing = await this.getActiveSettings(userId);

    if (existing) {
      return existing;
    }

    await this.userSettingsRepo
      .createQueryBuilder()
      .insert()
      .into(AiUserSettingsEntity)
      .values({
        user_id: userId,
        enabled: 0,
        allow_read_secrets: 0,
        require_action_confirmation: 1,
        provider_name: defaultProviderName,
        base_url: defaultBaseUrl,
      })
      .orIgnore()
      .execute();

    await this.ensureProviderSettings(userId, defaultProviderName, defaultBaseUrl);

    return (await this.getActiveSettings(userId)) as AiSettingsRow;
  }

  private async getActiveSettings(userId: number): Promise<AiSettingsRow | undefined> {
    const rows = (await this.dataSource.query(
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
          provider_settings.user_id as provider_present,
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
        WHERE user_settings.user_id = $1
      `,
      [userId],
    )) as Array<AiSettingsRow & { provider_present: number | null }>;

    const active = rows[0];

    if (!active) {
      return undefined;
    }

    if (active.provider_present === null) {
      await this.ensureProviderSettings(userId, active.provider_name, active.base_url);
      return this.getActiveSettings(userId);
    }

    return active;
  }

  private async ensureProviderSettings(
    userId: number,
    providerName: string,
    baseUrl: string,
  ): Promise<AiProviderSettingsRow> {
    await this.providerSettingsRepo
      .createQueryBuilder()
      .insert()
      .into(AiProviderSettingsEntity)
      .values({ user_id: userId, provider_name: providerName, base_url: baseUrl })
      .orIgnore()
      .execute();

    return this.providerSettingsRepo.findOneOrFail({
      where: { user_id: userId, provider_name: providerName, base_url: baseUrl },
    }) as unknown as Promise<AiProviderSettingsRow>;
  }

  private async listModels(userId: number, providerName: string): Promise<AiModelResponse[]> {
    const rows = (await this.providerModelsRepo.find({
      where: { user_id: userId, provider_name: providerName },
    })) as unknown as AiModelRow[];

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

  private async upsertModels(
    userId: number,
    providerName: string,
    models: SyncedProviderModel[],
    now: string,
  ): Promise<void> {
    const uniqueModels = [...new Map(models.map((model) => [model.modelId, model])).values()];
    const values = uniqueModels.map((model) => {
      const pricing = this.aiModelCatalogService.getPricing(model.modelId);
      const classification = this.aiModelCatalogService.classifyModel(model.modelId);
      return {
        user_id: userId,
        provider_name: providerName,
        model_id: model.modelId,
        label: model.modelId,
        tier: classification.tier,
        quality: classification.quality,
        speed: classification.speed,
        cost: classification.cost,
        capabilities: JSON.stringify(['chat']),
        input_price_per_1m: pricing.inputPricePer1M,
        cached_input_price_per_1m: pricing.cachedInputPricePer1M,
        output_price_per_1m: pricing.outputPricePer1M,
        provider_created_at: model.providerCreatedAt,
        is_deprecated: 0,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      };
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        AiProviderModelEntity,
        { user_id: userId, provider_name: providerName },
        { is_deprecated: 1, updated_at: now },
      );

      if (values.length === 0) {
        return;
      }

      await manager
        .createQueryBuilder()
        .insert()
        .into(AiProviderModelEntity)
        .values(values)
        .orUpdate(
          [
            'label',
            'tier',
            'quality',
            'speed',
            'cost',
            'capabilities',
            'input_price_per_1m',
            'cached_input_price_per_1m',
            'output_price_per_1m',
            'provider_created_at',
            'is_deprecated',
            'last_seen_at',
            'updated_at',
          ],
          ['user_id', 'provider_name', 'model_id'],
        )
        .execute();
    });
  }

  private async updateSyncState(
    userId: number,
    providerName: string,
    baseUrl: string,
    status: 'ok' | 'error',
    error: string | null,
    syncedAt: string,
  ): Promise<void> {
    await this.providerSettingsRepo.update(
      { user_id: userId, provider_name: providerName, base_url: baseUrl },
      {
        last_models_sync_at: syncedAt,
        models_sync_status: status,
        models_sync_error: error,
        updated_at: syncedAt,
      },
    );
  }

  private async mapSettings(
    settings: AiSettingsRow,
    models: AiModelResponse[],
  ): Promise<AiSettingsResponse> {
    return {
      enabled: Boolean(settings.enabled),
      allowReadSecrets: Boolean(settings.allow_read_secrets),
      requireActionConfirmation: Boolean(settings.require_action_confirmation),
      dailyRequestLimit: settings.daily_request_limit,
      dailyTokenLimit: settings.daily_token_limit,
      usageToday: await this.getUsageToday(settings.user_id),
      providerName: settings.provider_name,
      baseUrl: settings.base_url,
      model: settings.model ?? (await this.entitlementsService.getDefaultAiModel(settings.user_id)),
      hasApiKey: Boolean(settings.api_key_encrypted),
      apiKeyHint: settings.api_key_hint,
      apiKeyUpdatedAt: settings.api_key_updated_at,
      lastConnectionCheckAt: settings.last_connection_check_at,
      lastConnectionCheckStatus: settings.last_connection_check_status,
      lastModelsSyncAt: settings.last_models_sync_at,
      modelsSyncStatus: settings.models_sync_status,
      modelsSyncError: settings.models_sync_error,
      models,
      providers: await this.listSavedProviders(settings.user_id),
    };
  }

  private async listSavedProviders(userId: number): Promise<AiSavedProviderResponse[]> {
    const rows = (await this.providerSettingsRepo
      .createQueryBuilder('p')
      .where('p.user_id = :userId', { userId })
      .orderBy('p.updated_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .getMany()) as unknown as AiProviderSettingsRow[];

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
      contentHtml: redactSecretHtml(currentNote.contentHtml),
      contentText: redactSecretText(currentNote.contentText),
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

  private isBareConfirmation(message: string): boolean {
    return /^(да|yes|ok|ок|ага|угу)$/i.test(message.trim());
  }

  private getApiKey(settings: AiSettingsRow): string {
    const apiKey = this.aiCryptoService.decrypt(settings.api_key_encrypted);

    if (!apiKey) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI API key is not configured or cannot be decrypted',
        code: 'AI_KEY_MISSING',
      });
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
      throw new BadRequestException({
        statusCode: 400,
        message: 'AI provider base URL must be a valid HTTPS URL',
        code: 'AI_BASE_URL_INVALID',
      });
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
