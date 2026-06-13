import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { basename } from 'node:path';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { nowIso } from '../database/db.util';
import { AiBotPendingActionEntity, AiBotUsageLogEntity } from '../database/entities/ai-bot.entity';
import { AiBotSettingsService } from './ai-bot-settings.service';
import { AiCryptoService } from './ai-crypto.service';
import { AiService } from './ai.service';
import type {
  AiBotAdminSettingsRow,
  AiBotPermissions,
  AiBotProvider,
  AiBotUserSettingsRow,
  AiToolAction,
} from './ai.types';

const pendingActionTtlMs = 10 * 60 * 1000;
const botMessageLimit = 3500;
const botDownloadTimeoutMs = 30_000;
const maxBotVoiceBytes = 25 * 1024 * 1024;
type BotUsageKind = 'message' | 'read' | 'write';

interface TelegramAudioFile {
  file_id?: string;
  mime_type?: string;
  file_name?: string;
}

interface TelegramMessage {
  chat?: { id?: number | string };
  from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
  text?: string;
  voice?: TelegramAudioFile;
  audio?: TelegramAudioFile;
}

interface TelegramWebhookPayload {
  message?: TelegramMessage;
}

interface VkWebhookPayload {
  type?: string;
  secret?: string;
  group_id?: number | string;
  object?: {
    message?: {
      from_id?: number | string;
      peer_id?: number | string;
      text?: string;
      attachments?: VkAttachment[];
    };
  };
}

interface VkAttachment {
  type?: string;
  audio_message?: {
    link_ogg?: string;
    link_mp3?: string;
  };
}

interface BotVoiceAttachment {
  provider: AiBotProvider;
  telegramFileId?: string;
  sourceUrl?: string;
  fileName: string;
  mimeType: string;
}

interface BotVoiceAudio {
  content: Buffer;
  fileName: string;
  mimeType: string;
}

interface BotIncomingMessage {
  provider: AiBotProvider;
  externalId: string;
  chatId: string;
  username: string | null;
  text: string;
  voice: BotVoiceAttachment | null;
}

interface PendingActionRow {
  id: number;
  user_id: number;
  provider: AiBotProvider;
  external_id: string;
  action_name: string;
  action_payload: string;
  expires_at: string;
}

@Injectable()
export class AiBotRuntimeService {
  private readonly logger = new Logger(AiBotRuntimeService.name);

  constructor(
    @InjectRepository(AiBotPendingActionEntity)
    private readonly pendingActionsRepo: Repository<AiBotPendingActionEntity>,
    @InjectRepository(AiBotUsageLogEntity)
    private readonly usageLogsRepo: Repository<AiBotUsageLogEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(AiBotSettingsService) private readonly aiBotSettingsService: AiBotSettingsService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  async handleTelegramWebhook(
    payload: TelegramWebhookPayload,
    secretToken: string | undefined,
  ): Promise<{ ok: true }> {
    const settings = await this.getEnabledAdminSettings('telegram');
    this.verifyTelegramSecret(settings, secretToken);
    const message = this.parseTelegramMessage(payload);

    if (message) {
      await this.processIncomingMessage(settings, message);
    }

    return { ok: true };
  }

  async handleVkWebhook(payload: VkWebhookPayload): Promise<string> {
    const settings = await this.getEnabledAdminSettings('vk');

    if (payload.type === 'confirmation') {
      return settings.confirmation_code ?? '';
    }

    this.verifyVkWebhook(settings, payload);
    const message = this.parseVkMessage(payload);

    if (message) {
      await this.processIncomingMessage(settings, message);
    }

    return 'ok';
  }

  private async processIncomingMessage(
    adminSettings: AiBotAdminSettingsRow,
    message: BotIncomingMessage,
  ): Promise<void> {
    try {
      const rawText = message.text.trim();
      const linkCode = this.readLinkCode(rawText);

      if (linkCode) {
        await this.aiBotSettingsService.linkExternalAccount(
          message.provider,
          linkCode,
          message.externalId,
          message.username,
        );
        await this.sendMessage(
          adminSettings,
          message.chatId,
          'Аккаунт привязан. Теперь можно писать команды Notes AI.',
        );
        return;
      }

      const userSettings = await this.aiBotSettingsService.getLinkedUserSettings(
        message.provider,
        message.externalId,
      );

      if (!userSettings?.enabled) {
        await this.sendMessage(
          adminSettings,
          message.chatId,
          'Аккаунт не привязан. Создайте код привязки в Notes AI и отправьте его сюда.',
        );
        return;
      }

      const confirmation = rawText ? this.readConfirmation(rawText) : undefined;

      if (confirmation !== undefined) {
        await this.executePendingAction(adminSettings, userSettings, message.chatId, confirmation);
        return;
      }

      await this.enforceBotUsageLimit(userSettings, adminSettings, 'message', 1);
      const commandText = await this.resolveIncomingText(adminSettings, userSettings, message);
      const voiceConfirmation = rawText ? undefined : this.readConfirmation(commandText);

      if (voiceConfirmation !== undefined) {
        await this.executePendingAction(
          adminSettings,
          userSettings,
          message.chatId,
          voiceConfirmation,
        );
        await this.recordBotUsage(userSettings, 'message', 1, null);
        await this.recordMessageActivity(userSettings, message, commandText.length);
        return;
      }

      const response = await this.aiService.chat(
        userSettings.user_id,
        { message: commandText, history: [] },
        {
          allowedToolNames: await this.createAllowedToolSet(userSettings),
          allowReadSecretsOverride:
            Boolean(adminSettings.allow_secrets) && Boolean(userSettings.allow_secrets),
          // Bot runtime owns messenger confirmations and write-limit checks.
          requireActionConfirmationOverride: true,
        },
      );
      await this.enforceAndRecordToolUsage(userSettings, adminSettings, response.toolCalls ?? []);

      if (response.actions?.length) {
        await this.enforceBotUsageLimit(
          userSettings,
          adminSettings,
          'write',
          response.actions.length,
        );
        await this.handleBotActions(adminSettings, userSettings, message.chatId, response.actions);
      } else {
        await this.sendMessage(adminSettings, message.chatId, response.message.content);
      }

      await this.recordBotUsage(userSettings, 'message', 1, null);
      await this.recordMessageActivity(userSettings, message, commandText.length);
    } catch (caught) {
      this.logger.warn(
        `${message.provider} bot message failed for ${message.externalId}: ${(caught as Error).message}`,
      );
      await this.sendMessage(
        adminSettings,
        message.chatId,
        `Не удалось выполнить команду: ${(caught as Error).message}`,
      );
    }
  }

  private async resolveIncomingText(
    adminSettings: AiBotAdminSettingsRow,
    userSettings: AiBotUserSettingsRow,
    message: BotIncomingMessage,
  ): Promise<string> {
    const text = message.text.trim();

    if (text) {
      return text;
    }

    if (!message.voice) {
      throw new BadRequestException('Send a text or voice message with a command');
    }

    const audio = await this.downloadVoiceAudio(adminSettings, message.voice);
    return this.aiService.transcribeAudio(userSettings.user_id, audio);
  }

  private async handleBotActions(
    adminSettings: AiBotAdminSettingsRow,
    userSettings: AiBotUserSettingsRow,
    chatId: string,
    actions: AiToolAction[],
  ): Promise<void> {
    if (userSettings.access_mode !== 'write') {
      await this.sendMessage(
        adminSettings,
        chatId,
        'Команда требует изменения данных. Включите режим записи для этого бота в настройках Notes AI.',
      );
      return;
    }

    await this.assertBotActionsAllowed(userSettings, actions);

    const allowedToolNames = await this.createAllowedToolSet(userSettings);

    if (!adminSettings.require_confirmation) {
      const results = await Promise.all(
        actions.map((action) =>
          this.aiService.executeAction(userSettings.user_id, action, { allowedToolNames }),
        ),
      );
      await this.recordBotUsage(
        userSettings,
        'write',
        actions.length,
        actions.map((action) => action.name).join(','),
      );
      await this.sendMessage(
        adminSettings,
        chatId,
        results.map((result) => result.message.content).join('\n\n'),
      );
      return;
    }

    const pendingIds: number[] = [];
    for (const action of actions) {
      pendingIds.push(await this.createPendingAction(userSettings, action));
    }
    const text = actions
      .map((action, index) =>
        [
          `#${pendingIds[index]} ${action.title}`,
          action.description,
          `Подтвердить: подтвердить ${pendingIds[index]}`,
        ].join('\n'),
      )
      .join('\n\n');

    await this.sendMessage(adminSettings, chatId, text);
  }

  private async executePendingAction(
    adminSettings: AiBotAdminSettingsRow,
    userSettings: AiBotUserSettingsRow,
    chatId: string,
    pendingId: number | null,
  ): Promise<void> {
    if (userSettings.access_mode !== 'write') {
      await this.sendMessage(adminSettings, chatId, 'Режим записи для бота выключен.');
      return;
    }

    const pending = await this.getPendingAction(userSettings, pendingId);

    if (!pending) {
      await this.sendMessage(
        adminSettings,
        chatId,
        'Нет действия для подтверждения или срок истек.',
      );
      return;
    }

    const payload = this.parsePendingPayload(pending.action_payload);
    await this.enforceBotUsageLimit(userSettings, adminSettings, 'write', 1);
    await this.assertBotActionsAllowed(userSettings, [
      {
        name: pending.action_name,
        title: pending.action_name,
        description: '',
        payload,
      },
    ]);

    const response = await this.aiService.executeAction(
      userSettings.user_id,
      {
        name: pending.action_name,
        payload,
      },
      {
        allowedToolNames: await this.createAllowedToolSet(userSettings),
      },
    );
    await this.pendingActionsRepo.delete({ id: pending.id });
    await this.recordBotUsage(userSettings, 'write', 1, pending.action_name);
    await this.sendMessage(adminSettings, chatId, response.message.content);
  }

  private async createPendingAction(
    userSettings: AiBotUserSettingsRow,
    action: AiToolAction,
  ): Promise<number> {
    const expiresAt = new Date(Date.now() + pendingActionTtlMs).toISOString();
    if (!userSettings.linked_external_id) {
      throw new BadRequestException('Bot account is not linked');
    }

    const result = await this.pendingActionsRepo.insert({
      user_id: userSettings.user_id,
      provider: userSettings.provider,
      external_id: userSettings.linked_external_id,
      action_name: action.name,
      action_payload: JSON.stringify(action.payload),
      expires_at: expiresAt,
      created_at: nowIso(),
    });

    return Number((result.identifiers[0] as { id: number }).id);
  }

  private async getPendingAction(
    userSettings: AiBotUserSettingsRow,
    pendingId: number | null,
  ): Promise<PendingActionRow | null> {
    await this.pendingActionsRepo.delete({ expires_at: LessThanOrEqual(nowIso()) });

    const query = this.pendingActionsRepo
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId: userSettings.user_id })
      .andWhere('a.provider = :provider', { provider: userSettings.provider })
      .andWhere('a.external_id = :externalId', { externalId: userSettings.linked_external_id })
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .limit(1);

    if (pendingId !== null) {
      query.andWhere('a.id = :pendingId', { pendingId });
    }

    return ((await query.getOne()) as unknown as PendingActionRow | null) ?? null;
  }

  private async enforceAndRecordToolUsage(
    userSettings: AiBotUserSettingsRow,
    adminSettings: AiBotAdminSettingsRow,
    toolCalls: Array<{ name: string; mode: 'readonly' | 'mutation' }>,
  ): Promise<void> {
    const readonlyCalls = toolCalls.filter((toolCall) => toolCall.mode === 'readonly');

    if (readonlyCalls.length === 0) {
      return;
    }

    await this.enforceBotUsageLimit(userSettings, adminSettings, 'read', readonlyCalls.length);
    await this.recordBotUsage(
      userSettings,
      'read',
      readonlyCalls.length,
      readonlyCalls.map((toolCall) => toolCall.name).join(','),
    );
  }

  private async enforceBotUsageLimit(
    userSettings: AiBotUserSettingsRow,
    adminSettings: AiBotAdminSettingsRow,
    kind: BotUsageKind,
    increment: number,
  ): Promise<void> {
    const limit = this.readBotUsageLimit(userSettings, adminSettings, kind);

    if (!limit) {
      return;
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = (await this.dataSource.query(
      `
        SELECT COALESCE(SUM(usage_count), 0)::bigint as count
        FROM ai_bot_usage_logs
        WHERE user_id = $1
          AND provider = $2
          AND kind = $3
          AND created_at >= $4
      `,
      [userSettings.user_id, userSettings.provider, kind, dayStart.toISOString()],
    )) as Array<{ count: unknown }>;

    if (Number(rows[0]?.count ?? 0) + increment > limit) {
      throw new BadRequestException(this.getLimitMessage(kind));
    }
  }

  private readBotUsageLimit(
    userSettings: AiBotUserSettingsRow,
    adminSettings: AiBotAdminSettingsRow,
    kind: BotUsageKind,
  ): number | null {
    switch (kind) {
      case 'read':
        return userSettings.daily_read_limit ?? adminSettings.daily_read_limit;
      case 'write':
        return userSettings.daily_write_limit ?? adminSettings.daily_write_limit;
      default:
        return userSettings.daily_request_limit ?? adminSettings.daily_request_limit;
    }
  }

  private getLimitMessage(kind: BotUsageKind): string {
    switch (kind) {
      case 'read':
        return 'Daily bot read limit is reached';
      case 'write':
        return 'Daily bot change limit is reached';
      default:
        return 'Daily bot request limit is reached';
    }
  }

  private async recordBotUsage(
    userSettings: AiBotUserSettingsRow,
    kind: BotUsageKind,
    count: number,
    actionName: string | null,
  ): Promise<void> {
    await this.usageLogsRepo.insert({
      user_id: userSettings.user_id,
      provider: userSettings.provider,
      kind,
      action_name: actionName,
      usage_count: count,
      created_at: nowIso(),
    });
  }

  private async recordMessageActivity(
    userSettings: AiBotUserSettingsRow,
    message: BotIncomingMessage,
    messageLength: number,
  ): Promise<void> {
    await this.activityService.record({
      actorId: userSettings.user_id,
      userId: userSettings.user_id,
      action: 'ai.bot.message',
      targetType: message.provider,
      targetId: userSettings.user_id,
      details: {
        externalId: message.externalId,
        hasVoice: Boolean(message.voice),
        messageLength,
      },
    });
  }

  private async assertBotActionsAllowed(
    userSettings: AiBotUserSettingsRow,
    actions: AiToolAction[],
  ): Promise<void> {
    const allowedToolNames = await this.createAllowedToolSet(userSettings);
    const denied = actions
      .map((action) => action.name)
      .filter((name) => !allowedToolNames.has(name));

    if (denied.length > 0) {
      throw new BadRequestException(`Bot permission denied for: ${denied.join(', ')}`);
    }
  }

  private async createAllowedToolSet(
    userSettings: AiBotUserSettingsRow,
  ): Promise<ReadonlySet<string>> {
    const permissions = this.readPermissions(userSettings);
    const canWrite = userSettings.access_mode === 'write';
    const tools = new Set<string>();

    if (permissions.readNotes) {
      tools.add('notes.search');
      tools.add('notes.semanticSearch');
      tools.add('notes.read');
    }

    if (permissions.useTemplates) {
      tools.add('templates.list');
    }

    if (permissions.useVersions) {
      tools.add('versions.list');
    }

    if (permissions.listAttachments) {
      tools.add('attachments.list');
    }

    if (await this.isAdminUser(userSettings.user_id)) {
      tools.add('admin.users.list');
      tools.add('admin.stats.read');
    }

    if (!canWrite) {
      return tools;
    }

    if (permissions.writeNotes) {
      tools.add('notes.create');
      tools.add('notes.createNestedBatch');
      tools.add('notes.update');
      tools.add('notes.favorite.set');
      tools.add('notes.pinned.set');
    }

    if (permissions.manageTags) {
      tools.add('notes.tags.set');
      tools.add('notes.autotag');
    }

    if (permissions.deleteNotes) {
      tools.add('notes.delete');
      tools.add('notes.deleteAll');
      tools.add('notes.restore');
    }

    if (permissions.useTemplates) {
      tools.add('templates.createNote');
    }

    if (permissions.useVersions) {
      tools.add('versions.restore');
    }

    if (permissions.createShareLinks) {
      tools.add('shareLinks.create');
    }

    if (permissions.listAttachments) {
      tools.add('attachments.attachToNote');
    }

    return tools;
  }

  private async isAdminUser(userId: number): Promise<boolean> {
    const rows = (await this.dataSource.query('SELECT role FROM users WHERE id = $1', [
      userId,
    ])) as Array<{ role: string }>;

    return rows[0]?.role === 'admin';
  }

  private readPermissions(userSettings: AiBotUserSettingsRow): AiBotPermissions {
    return {
      readNotes: Boolean(userSettings.allow_note_read),
      writeNotes: Boolean(userSettings.allow_note_write),
      deleteNotes: Boolean(userSettings.allow_note_delete),
      manageTags: Boolean(userSettings.allow_tags),
      useTemplates: Boolean(userSettings.allow_templates),
      useVersions: Boolean(userSettings.allow_versions),
      listAttachments: Boolean(userSettings.allow_attachments),
      createShareLinks: Boolean(userSettings.allow_share_links),
    };
  }

  private async downloadVoiceAudio(
    settings: AiBotAdminSettingsRow,
    voice: BotVoiceAttachment,
  ): Promise<BotVoiceAudio> {
    if (voice.provider === 'telegram') {
      return this.downloadTelegramVoice(settings, voice);
    }

    return this.downloadVkVoice(voice);
  }

  private async downloadTelegramVoice(
    settings: AiBotAdminSettingsRow,
    voice: BotVoiceAttachment,
  ): Promise<BotVoiceAudio> {
    const token = this.getTelegramBotToken(settings);
    const fileId = voice.telegramFileId;

    if (!fileId) {
      throw new BadRequestException('Telegram voice file id is missing');
    }

    const fileResponse = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(botDownloadTimeoutMs) },
    );
    const filePayload = (await fileResponse.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      result?: { file_path?: string; file_size?: number };
    } | null;

    if (!fileResponse.ok || !filePayload?.ok || !filePayload.result?.file_path) {
      throw new BadRequestException(
        filePayload?.description ?? 'Telegram voice file is not available',
      );
    }

    if (
      typeof filePayload.result.file_size === 'number' &&
      filePayload.result.file_size > maxBotVoiceBytes
    ) {
      throw new BadRequestException('Voice message is too large');
    }

    const filePath = filePayload.result.file_path;
    return this.downloadVoiceFromUrl(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      basename(filePath) || voice.fileName,
      voice.mimeType,
    );
  }

  private async downloadVkVoice(voice: BotVoiceAttachment): Promise<BotVoiceAudio> {
    if (!voice.sourceUrl) {
      throw new BadRequestException('VK voice URL is missing');
    }

    try {
      const url = new URL(voice.sourceUrl);

      if (url.protocol !== 'https:') {
        throw new Error('Only HTTPS voice URLs are allowed');
      }
    } catch {
      throw new BadRequestException('VK voice URL is invalid');
    }

    return this.downloadVoiceFromUrl(voice.sourceUrl, voice.fileName, voice.mimeType);
  }

  private async downloadVoiceFromUrl(
    url: string,
    fileName: string,
    mimeType: string,
  ): Promise<BotVoiceAudio> {
    const response = await fetch(url, { signal: AbortSignal.timeout(botDownloadTimeoutMs) });
    const declaredSize = Number(response.headers.get('content-length'));

    if (!response.ok) {
      throw new BadRequestException(`Voice download returned ${response.status}`);
    }

    if (Number.isFinite(declaredSize) && declaredSize > maxBotVoiceBytes) {
      throw new BadRequestException('Voice message is too large');
    }

    const content = Buffer.from(await response.arrayBuffer());

    if (content.byteLength > maxBotVoiceBytes) {
      throw new BadRequestException('Voice message is too large');
    }

    if (content.byteLength === 0) {
      throw new BadRequestException('Voice message is empty');
    }

    return { content, fileName, mimeType };
  }

  private async sendMessage(
    settings: AiBotAdminSettingsRow,
    chatId: string,
    text: string,
  ): Promise<void> {
    const normalizedText = text.trim().slice(0, botMessageLimit) || 'Готово.';

    if (settings.provider === 'telegram') {
      await this.sendTelegramMessage(settings, chatId, normalizedText);
      return;
    }

    await this.sendVkMessage(settings, chatId, normalizedText);
  }

  private async sendTelegramMessage(
    settings: AiBotAdminSettingsRow,
    chatId: string,
    text: string,
  ): Promise<void> {
    const token = this.getTelegramBotToken(settings);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new BadRequestException(`Telegram sendMessage returned ${response.status}`);
    }
  }

  private async sendVkMessage(
    settings: AiBotAdminSettingsRow,
    chatId: string,
    text: string,
  ): Promise<void> {
    const token = this.getVkAccessToken(settings);

    const body = new URLSearchParams({
      peer_id: chatId,
      message: text,
      random_id: String(Date.now()),
      access_token: token,
      v: '5.199',
    });
    const response = await fetch('https://api.vk.com/method/messages.send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: { error_msg?: string };
    } | null;

    if (!response.ok || payload?.error) {
      throw new BadRequestException(
        payload?.error?.error_msg ?? `VK messages.send returned ${response.status}`,
      );
    }
  }

  private getTelegramBotToken(settings: AiBotAdminSettingsRow): string {
    const token = this.aiCryptoService.decrypt(settings.bot_token_encrypted);

    if (!token) {
      throw new BadRequestException('Telegram bot token is not configured');
    }

    return token;
  }

  private getVkAccessToken(settings: AiBotAdminSettingsRow): string {
    const token = this.aiCryptoService.decrypt(settings.access_token_encrypted);

    if (!token) {
      throw new BadRequestException('VK access token is not configured');
    }

    return token;
  }

  private async getEnabledAdminSettings(provider: AiBotProvider): Promise<AiBotAdminSettingsRow> {
    const settings = await this.aiBotSettingsService.getAdminSettings(provider);

    if (!settings.enabled) {
      throw new BadRequestException(`${provider} bot is disabled`);
    }

    return settings;
  }

  private verifyTelegramSecret(
    settings: AiBotAdminSettingsRow,
    secretToken: string | undefined,
  ): void {
    const expectedSecret = this.aiCryptoService.decrypt(settings.secret_encrypted);

    if (!expectedSecret) {
      throw new BadRequestException('Telegram webhook secret is not configured');
    }
    if (expectedSecret !== secretToken) {
      throw new BadRequestException('Invalid Telegram webhook secret');
    }
  }

  private verifyVkWebhook(settings: AiBotAdminSettingsRow, payload: VkWebhookPayload): void {
    const expectedSecret = this.aiCryptoService.decrypt(settings.secret_encrypted);

    if (!expectedSecret) {
      throw new BadRequestException('VK webhook secret is not configured');
    }
    if (payload.secret !== expectedSecret) {
      throw new BadRequestException('Invalid VK webhook secret');
    }

    if (settings.group_id && String(payload.group_id ?? '') !== settings.group_id) {
      throw new BadRequestException('Invalid VK group id');
    }
  }

  private parseTelegramMessage(payload: TelegramWebhookPayload): BotIncomingMessage | null {
    const message = payload.message;
    const text = message?.text?.trim() ?? '';
    const voice = this.parseTelegramVoice(message);
    const externalId = message?.from?.id;
    const chatId = message?.chat?.id;

    if ((!text && !voice) || externalId === undefined || chatId === undefined) {
      return null;
    }

    return {
      provider: 'telegram',
      externalId: String(externalId),
      chatId: String(chatId),
      username: this.normalizeUsername(message?.from?.username),
      text,
      voice,
    };
  }

  private parseVkMessage(payload: VkWebhookPayload): BotIncomingMessage | null {
    const message = payload.object?.message;
    const text = message?.text?.trim() ?? '';
    const voice = this.parseVkVoice(message?.attachments);
    const externalId = message?.from_id;
    const chatId = message?.peer_id;

    if ((!text && !voice) || externalId === undefined || chatId === undefined) {
      return null;
    }

    return {
      provider: 'vk',
      externalId: String(externalId),
      chatId: String(chatId),
      username: null,
      text,
      voice,
    };
  }

  private parseTelegramVoice(message: TelegramMessage | undefined): BotVoiceAttachment | null {
    const file = message?.voice ?? message?.audio;
    const fileId = file?.file_id?.trim();

    if (!file || !fileId) {
      return null;
    }

    return {
      provider: 'telegram',
      telegramFileId: fileId,
      fileName: file.file_name?.trim() || 'telegram-voice.ogg',
      mimeType: file.mime_type?.trim() || 'audio/ogg',
    };
  }

  private parseVkVoice(attachments: VkAttachment[] | undefined): BotVoiceAttachment | null {
    const audioMessage = attachments?.find(
      (attachment) => attachment.type === 'audio_message' && attachment.audio_message,
    )?.audio_message;
    const sourceUrl = audioMessage?.link_ogg?.trim() || audioMessage?.link_mp3?.trim();

    if (!sourceUrl) {
      return null;
    }

    const isMp3 = sourceUrl.toLowerCase().includes('.mp3');

    return {
      provider: 'vk',
      sourceUrl,
      fileName: isMp3 ? 'vk-voice.mp3' : 'vk-voice.ogg',
      mimeType: isMp3 ? 'audio/mpeg' : 'audio/ogg',
    };
  }

  private readLinkCode(text: string): string | null {
    const match = text
      .trim()
      .match(/^(?:\/start|\/link|link|код|привязать)?\s*([a-z0-9]{4}(?:[-\s]?[a-z0-9]{4}){4})$/i);
    return match?.[1] ?? null;
  }

  private readConfirmation(text: string): number | null | undefined {
    const normalized = text.trim().toLowerCase();

    if (/^(отмена|cancel|no|нет)$/.test(normalized)) {
      return undefined;
    }

    if (/^(подтвердить|confirm|ok|да)$/.test(normalized)) {
      return null;
    }

    const match = normalized.match(/^(?:подтвердить|confirm|ok|да)\s+#?(\d+)$/);
    return match ? Number(match[1]) : undefined;
  }

  private parsePendingPayload(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private normalizeUsername(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? `@${trimmed}` : null;
  }
}
