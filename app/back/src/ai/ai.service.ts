import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { ActivityService } from '../activity/activity.service';
import { DatabaseService } from '../infra/database.service';
import { AiCryptoService } from './ai-crypto.service';
import { AiToolsService } from './ai-tools.service';
import type { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import type { SendAiMessageDto } from './dto/send-ai-message.dto';
import type { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import type {
  AiChatMessage,
  AiChatResponse,
  AiModelResponse,
  AiModelRow,
  AiModelSignal,
  AiModelTier,
  AiSettingsResponse,
  AiSettingsRow,
  AiToolExecutionResponse,
  OpenAiCompatibleChatResponse,
  OpenAiCompatibleModelsResponse,
} from './ai.types';

const defaultProviderName = 'OpenAI-compatible';
const defaultBaseUrl = 'https://api.openai.com/v1';
const chatTimeoutMs = 45_000;
const modelsTimeoutMs = 20_000;
const sortRankMultiplier = 1_000_000_000;

interface SyncedProviderModel {
  modelId: string;
  providerCreatedAt: number | null;
}

const knownModelSignals: Record<
  string,
  Partial<
    Pick<
      AiModelResponse,
      | 'tier'
      | 'quality'
      | 'speed'
      | 'cost'
      | 'score'
      | 'speedScore'
      | 'valueScore'
      | 'sortRank'
      | 'capabilities'
    >
  >
> = {
  'gpt-5.2-pro': { score: 99, speedScore: 62, valueScore: 54, sortRank: 5220 },
  'gpt-5.2': { score: 97, speedScore: 70, valueScore: 62, sortRank: 5200 },
  'gpt-5.1-codex-max': { score: 96, speedScore: 63, valueScore: 58, sortRank: 5160 },
  'gpt-5.1-codex-mini': { score: 84, speedScore: 86, valueScore: 78, sortRank: 5155 },
  'gpt-5.1-codex': { score: 94, speedScore: 68, valueScore: 60, sortRank: 5150 },
  'gpt-5.1': { score: 94, speedScore: 72, valueScore: 66, sortRank: 5100 },
  'gpt-5-pro': { score: 96, speedScore: 58, valueScore: 52, sortRank: 5020 },
  'gpt-5-mini': { score: 82, speedScore: 88, valueScore: 82, sortRank: 5010 },
  'gpt-5-nano': { score: 68, speedScore: 98, valueScore: 88, sortRank: 5005 },
  'gpt-5': { score: 91, speedScore: 74, valueScore: 68, sortRank: 5000 },
  'gpt-4.5': { score: 88, speedScore: 55, valueScore: 46, sortRank: 4500 },
  'gpt-4.1-nano': { score: 56, speedScore: 97, valueScore: 88, sortRank: 4105 },
  'gpt-4.1-mini': { score: 72, speedScore: 91, valueScore: 84, sortRank: 4110 },
  'gpt-4.1': { score: 83, speedScore: 76, valueScore: 72, sortRank: 4100 },
  'gpt-4o-mini': { score: 66, speedScore: 92, valueScore: 86, sortRank: 4060 },
  'gpt-4o': { score: 78, speedScore: 82, valueScore: 74, sortRank: 4050 },
  'gpt-4-turbo': { score: 70, speedScore: 64, valueScore: 48, sortRank: 4010 },
  'gpt-4': { score: 64, speedScore: 48, valueScore: 36, sortRank: 4000 },
  'gpt-3.5-turbo': { score: 40, speedScore: 86, valueScore: 70, sortRank: 3500 },
  'o4-mini': { score: 74, speedScore: 84, valueScore: 82, sortRank: 4040 },
  'o3-pro': { score: 89, speedScore: 44, valueScore: 38, sortRank: 3035 },
  'o3-mini': { score: 58, speedScore: 82, valueScore: 74, sortRank: 3031 },
  o3: { score: 82, speedScore: 58, valueScore: 54, sortRank: 3030 },
  'o1-pro': { score: 78, speedScore: 38, valueScore: 32, sortRank: 1015 },
  'o1-mini': { score: 48, speedScore: 78, valueScore: 68, sortRank: 1011 },
  o1: { score: 70, speedScore: 48, valueScore: 42, sortRank: 1010 },
  'gpt-oss-120b': { tier: 'free', score: 76, speedScore: 70, valueScore: 90, sortRank: 1200 },
  'gpt-oss-20b': { tier: 'free', score: 52, speedScore: 88, valueScore: 92, sortRank: 200 },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AiToolsService) private readonly aiToolsService: AiToolsService,
  ) {}

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
    const nextModel =
      dto.model === null ? null : this.normalizeNullableText(dto.model, current.model);
    const updates: Record<string, unknown> = {
      userId,
      enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
      providerName: nextProvider,
      baseUrl: nextBaseUrl,
      model: nextModel,
      now,
    };
    const assignments = [
      'enabled = @enabled',
      'provider_name = @providerName',
      'base_url = @baseUrl',
      'model = @model',
      'updated_at = @now',
    ];

    if (dto.clearApiKey) {
      assignments.push(
        'api_key_encrypted = NULL',
        'api_key_hint = NULL',
        'api_key_updated_at = NULL',
      );
    } else if (dto.apiKey?.trim()) {
      updates.apiKeyEncrypted = this.aiCryptoService.encrypt(dto.apiKey.trim());
      updates.apiKeyHint = this.aiCryptoService.createHint(dto.apiKey.trim());
      assignments.push(
        'api_key_encrypted = @apiKeyEncrypted',
        'api_key_hint = @apiKeyHint',
        'api_key_updated_at = @now',
      );
    }

    this.databaseService.connection
      .prepare(`UPDATE ai_user_settings SET ${assignments.join(', ')} WHERE user_id = @userId`)
      .run(updates);

    this.activityService.record({
      actorId: userId,
      userId,
      action: 'ai.settings.update',
      targetType: 'ai_settings',
      targetId: userId,
      details: { enabled: Boolean(updates.enabled), providerName: nextProvider, model: nextModel },
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
                providerCreatedAt: this.normalizeProviderCreatedAt(model.created),
              }
            : null,
        )
        .filter((model): model is SyncedProviderModel => Boolean(model));

      this.upsertModels(userId, settings.provider_name, models, now);
      this.updateSyncState(userId, 'ok', null, now);
    } catch (caught) {
      const message = (caught as Error).message || 'Failed to sync models';
      this.updateSyncState(userId, 'error', message, now);
      this.logger.warn(`AI models sync failed for user ${userId}: ${message}`);
      throw new BadRequestException(message);
    }

    return this.getSettings(userId);
  }

  async testConnection(userId: number): Promise<{ ok: boolean; checkedAt: string }> {
    await this.syncModels(userId);
    const checkedAt = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_user_settings
          SET last_connection_check_at = @checkedAt,
              last_connection_check_status = 'ok',
              updated_at = @checkedAt
          WHERE user_id = @userId
        `,
      )
      .run({ userId, checkedAt });

    return { ok: true, checkedAt };
  }

  async chat(userId: number, dto: SendAiMessageDto): Promise<AiChatResponse> {
    const settings = this.ensureSettings(userId);

    if (!settings.enabled) {
      throw new BadRequestException('AI assistant is disabled');
    }

    const apiKey = this.getApiKey(settings);
    const model = settings.model?.trim();

    if (!model) {
      throw new BadRequestException('AI model is not selected');
    }

    if (this.isBareConfirmation(dto.message)) {
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
    const messages: AiChatMessage[] = [
      {
        role: 'developer',
        content: [
          'You are an assistant inside a private notes app. Answer briefly and clearly.',
          'Do not claim that you changed notes unless a tool result says so.',
          this.aiToolsService.getToolInstructions(),
          this.buildCurrentNotePrompt(currentNote),
        ].join(' '),
      },
      ...this.normalizeHistory(dto.history),
      { role: 'user', content: dto.message.trim() },
    ];
    const response = await fetch(this.buildProviderUrl(settings.base_url, 'chat/completions'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: this.aiToolsService.getOpenAiTools(),
        tool_choice: 'auto',
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
    const toolCalls = this.aiToolsService.parseToolCalls(payload.choices?.[0]?.message?.tool_calls);

    if (toolCalls.length > 0) {
      const results = toolCalls.map((toolCall) =>
        this.aiToolsService.handleToolCall(userId, toolCall),
      );
      const actions = results.flatMap((result) => (result.action ? [result.action] : []));

      this.recordChatActivity(userId, model, dto.message.length);

      return {
        message: {
          role: 'assistant',
          content: results.map((result) => result.message.content).join('\n\n'),
        },
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      throw new BadRequestException('AI provider returned an empty response');
    }

    this.recordChatActivity(userId, model, dto.message.length);

    return { message: { role: 'assistant', content: content.trim() } };
  }

  executeAction(userId: number, dto: ExecuteAiToolDto): AiToolExecutionResponse {
    return this.aiToolsService.executeAction(userId, dto.name, dto.payload);
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

  private ensureSettings(userId: number): AiSettingsRow {
    const existing = this.databaseService.connection
      .prepare('SELECT * FROM ai_user_settings WHERE user_id = ?')
      .get(userId) as AiSettingsRow | undefined;

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO ai_user_settings
            (user_id, enabled, provider_name, base_url, created_at, updated_at)
          VALUES (@userId, 0, @providerName, @baseUrl, @now, @now)
        `,
      )
      .run({ userId, providerName: defaultProviderName, baseUrl: defaultBaseUrl, now });

    return this.databaseService.connection
      .prepare('SELECT * FROM ai_user_settings WHERE user_id = ?')
      .get(userId) as AiSettingsRow;
  }

  private listModels(userId: number, providerName: string): AiModelResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT * FROM ai_provider_models
          WHERE user_id = @userId AND provider_name = @providerName
          ORDER BY is_deprecated ASC,
                   CASE tier WHEN 'paid' THEN 0 WHEN 'free' THEN 1 ELSE 2 END,
                   lower(label) ASC
        `,
      )
      .all({ userId, providerName }) as AiModelRow[];

    return rows
      .map((row) => {
        const classification = this.classifyModel(row.model_id);
        const providerCreatedAt = this.normalizeProviderCreatedAt(row.provider_created_at);

        return {
          id: row.model_id,
          label: row.label,
          ...classification,
          sortRank: this.createSortRank(row.model_id, classification.sortRank, providerCreatedAt),
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
             provider_created_at, is_deprecated, last_seen_at, created_at, updated_at)
          VALUES
            (@userId, @providerName, @modelId, @label, @tier, @quality, @speed, @cost,
             @capabilities, @providerCreatedAt, 0, @now, @now, @now)
          ON CONFLICT(user_id, provider_name, model_id) DO UPDATE SET
            label = excluded.label,
            tier = excluded.tier,
            quality = excluded.quality,
            speed = excluded.speed,
            cost = excluded.cost,
            capabilities = excluded.capabilities,
            provider_created_at = COALESCE(excluded.provider_created_at, ai_provider_models.provider_created_at),
            is_deprecated = 0,
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at
        `,
      );

      for (const model of uniqueModels) {
        statement.run({
          userId,
          providerName,
          modelId: model.modelId,
          label: model.modelId,
          ...this.classifyModel(model.modelId),
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
    status: 'ok' | 'error',
    error: string | null,
    syncedAt: string,
  ): void {
    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_user_settings
          SET last_models_sync_at = @syncedAt,
              models_sync_status = @status,
              models_sync_error = @error,
              updated_at = @syncedAt
          WHERE user_id = @userId
        `,
      )
      .run({ userId, status, error, syncedAt });
  }

  private mapSettings(settings: AiSettingsRow, models: AiModelResponse[]): AiSettingsResponse {
    return {
      enabled: Boolean(settings.enabled),
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
    };
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

  private buildCurrentNotePrompt(
    currentNote: { id: number; name: string; contentHtml: string; contentText: string } | null,
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
      `id=${currentNote.id}`,
      `name="${this.escapePromptText(currentNote.name, 180)}"`,
      'Use this noteId when the user says current, selected, opened, this, already created note.',
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

  private classifyModel(modelId: string): {
    tier: AiModelTier;
    quality: AiModelSignal;
    speed: AiModelSignal;
    cost: AiModelSignal;
    score: number;
    speedScore: number;
    valueScore: number;
    sortRank: number;
  } {
    const lowerModelId = modelId.toLowerCase();
    const known = this.findKnownModelSignal(lowerModelId);
    const score = known?.score ?? this.estimateModelScore(lowerModelId);
    const speedScore = known?.speedScore ?? this.estimateSpeedScore(lowerModelId);
    const valueScore = known?.valueScore ?? this.estimateValueScore(lowerModelId, speedScore);

    return {
      tier: known?.tier ?? this.estimateTier(lowerModelId),
      quality: known?.quality ?? this.signalFromScore(score),
      speed: known?.speed ?? this.signalFromScore(speedScore),
      cost: known?.cost ?? (valueScore >= 78 ? 'low' : valueScore >= 55 ? 'medium' : 'high'),
      score,
      speedScore,
      valueScore,
      sortRank: known?.sortRank ?? this.estimateSortRank(lowerModelId),
    };
  }

  private findKnownModelSignal(
    modelId: string,
  ): Partial<
    Pick<
      AiModelResponse,
      | 'tier'
      | 'quality'
      | 'speed'
      | 'cost'
      | 'score'
      | 'speedScore'
      | 'valueScore'
      | 'sortRank'
      | 'capabilities'
    >
  > | null {
    return (
      Object.entries(knownModelSignals)
        .sort(([left], [right]) => right.length - left.length)
        .find(([knownId]) => this.isKnownModelMatch(modelId, knownId))?.[1] ?? null
    );
  }

  private isKnownModelMatch(modelId: string, knownId: string): boolean {
    return (
      modelId === knownId ||
      modelId.startsWith(`${knownId}-`) ||
      modelId.startsWith(`${knownId}:`) ||
      modelId.startsWith(`${knownId}/`)
    );
  }

  private estimateTier(modelId: string): AiModelTier {
    if (modelId.includes(':free') || modelId.includes('-free') || modelId.includes('free')) {
      return 'free';
    }

    if (/^(gpt-|o\d|chatgpt-|computer-use|codex)/.test(modelId)) {
      return 'paid';
    }

    return 'unknown';
  }

  private estimateModelScore(modelId: string): number {
    if (modelId.includes('gpt-5')) {
      return modelId.includes('nano') ? 68 : modelId.includes('mini') ? 82 : 90;
    }

    if (modelId.includes('gpt-4.1')) {
      return modelId.includes('nano') ? 56 : modelId.includes('mini') ? 72 : 83;
    }

    if (modelId.includes('gpt-4o')) {
      return modelId.includes('mini') ? 66 : 78;
    }

    if (modelId.startsWith('o4')) {
      return 74;
    }

    if (modelId.startsWith('o3')) {
      return modelId.includes('mini') ? 58 : 82;
    }

    if (modelId.startsWith('o1')) {
      return modelId.includes('mini') ? 48 : 70;
    }

    return 50;
  }

  private estimateSpeedScore(modelId: string): number {
    if (modelId.includes('nano')) {
      return 98;
    }

    if (modelId.includes('mini')) {
      return 88;
    }

    if (modelId.includes('pro')) {
      return 46;
    }

    if (modelId.includes('turbo')) {
      return 78;
    }

    return 68;
  }

  private estimateValueScore(modelId: string, speedScore: number): number {
    if (modelId.includes('nano')) {
      return 88;
    }

    if (modelId.includes('mini')) {
      return 82;
    }

    if (modelId.includes('pro')) {
      return 36;
    }

    if (modelId.includes('turbo')) {
      return 62;
    }

    return Math.max(
      35,
      Math.min(82, Math.round((speedScore + this.estimateModelScore(modelId)) / 2 - 8)),
    );
  }

  private estimateSortRank(modelId: string): number {
    const gptMatch = modelId.match(/gpt-(\d)(?:\.(\d))?(?:\.(\d))?/);

    if (gptMatch) {
      const major = Number(gptMatch[1] ?? 0);
      const minor = Number(gptMatch[2] ?? 0);
      const patch = Number(gptMatch[3] ?? 0);
      const sizeBonus = modelId.includes('pro')
        ? 20
        : modelId.includes('mini')
          ? 10
          : modelId.includes('nano')
            ? 5
            : 0;

      return major * 1000 + minor * 100 + patch * 10 + sizeBonus;
    }

    const reasoningMatch = modelId.match(/^o(\d)/);

    if (reasoningMatch) {
      return Number(reasoningMatch[1]) * 1000 + (modelId.includes('mini') ? 10 : 20);
    }

    return 0;
  }

  private createSortRank(
    modelId: string,
    baseSortRank: number,
    providerCreatedAt: number | null,
  ): number {
    return (
      baseSortRank * sortRankMultiplier +
      (providerCreatedAt ?? this.extractDateRankFromModelId(modelId) ?? 0)
    );
  }

  private normalizeProviderCreatedAt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.trunc(value);
  }

  private extractDateRankFromModelId(modelId: string): number | null {
    const dateMatch = modelId.match(/(?:^|[-_])(\d{4})[-_]?(\d{2})[-_]?(\d{2})(?:$|[-_])/);

    if (!dateMatch) {
      return null;
    }

    return Number(`${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`);
  }

  private signalFromScore(score: number): AiModelSignal {
    if (score >= 75) {
      return 'high';
    }

    if (score >= 50) {
      return 'medium';
    }

    return 'low';
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
