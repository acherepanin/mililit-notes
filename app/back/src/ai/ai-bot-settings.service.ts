import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { ActivityService } from '../activity/activity.service';
import { DatabaseService } from '../infra/database.service';
import { AiCryptoService } from './ai-crypto.service';
import type { UpdateAiBotAdminSettingsDto } from './dto/update-ai-bot-admin-settings.dto';
import type { UpdateAiBotUserSettingsDto } from './dto/update-ai-bot-user-settings.dto';
import type {
  AiBotAdminSettingsResponse,
  AiBotAdminSettingsRow,
  AiBotConnectionCheckResponse,
  AiBotLinkCodeResponse,
  AiBotPermissions,
  AiBotProvider,
  AiBotUserSettingsResponse,
  AiBotUserSettingsRow,
} from './ai.types';

const botProviders: AiBotProvider[] = ['telegram', 'vk'];
const linkCodeTtlMs = 10 * 60 * 1000;
const linkCodeBytes = 10;
const linkCodeMaxAttempts = 10;

@Injectable()
export class AiBotSettingsService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  listAdminSettings(): AiBotAdminSettingsResponse[] {
    return botProviders.map((provider) =>
      this.mapAdminSettings(this.ensureAdminSettings(provider)),
    );
  }

  updateAdminSettings(
    actorId: number,
    provider: string,
    dto: UpdateAiBotAdminSettingsDto,
  ): AiBotAdminSettingsResponse {
    const botProvider = this.normalizeProvider(provider);
    const current = this.ensureAdminSettings(botProvider);
    const updates: Record<string, unknown> = {
      provider: botProvider,
      enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
      webhookUrl:
        dto.webhookUrl === undefined ? current.webhook_url : this.normalizeNullable(dto.webhookUrl),
      groupId: dto.groupId === undefined ? current.group_id : this.normalizeNullable(dto.groupId),
      confirmationCode:
        dto.confirmationCode === undefined
          ? current.confirmation_code
          : this.normalizeNullable(dto.confirmationCode),
      allowSecrets:
        dto.allowSecrets === undefined ? current.allow_secrets : dto.allowSecrets ? 1 : 0,
      requireConfirmation:
        dto.requireConfirmation === undefined
          ? current.require_confirmation
          : dto.requireConfirmation
            ? 1
            : 0,
      dailyRequestLimit: this.normalizeLimit(dto.dailyRequestLimit, current.daily_request_limit),
      dailyReadLimit: this.normalizeLimit(dto.dailyReadLimit, current.daily_read_limit),
      dailyWriteLimit: this.normalizeLimit(dto.dailyWriteLimit, current.daily_write_limit),
      now: new Date().toISOString(),
    };
    const assignments = [
      'enabled = @enabled',
      'webhook_url = @webhookUrl',
      'group_id = @groupId',
      'confirmation_code = @confirmationCode',
      'allow_secrets = @allowSecrets',
      'require_confirmation = @requireConfirmation',
      'daily_request_limit = @dailyRequestLimit',
      'daily_read_limit = @dailyReadLimit',
      'daily_write_limit = @dailyWriteLimit',
      'updated_at = @now',
    ];

    this.applySecretUpdate(
      assignments,
      updates,
      'bot_token',
      'botTokenEncrypted',
      dto.botToken,
      dto.clearBotToken,
    );
    this.applySecretUpdate(
      assignments,
      updates,
      'access_token',
      'accessTokenEncrypted',
      dto.accessToken,
      dto.clearAccessToken,
    );
    this.applySecretUpdate(
      assignments,
      updates,
      'secret',
      'secretEncrypted',
      dto.secret,
      dto.clearSecret,
    );

    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_bot_admin_settings
          SET ${assignments.join(', ')}
          WHERE provider = @provider
        `,
      )
      .run(updates);

    this.activityService.record({
      actorId,
      userId: actorId,
      action: 'ai.bot.settings.update',
      targetType: 'ai_bot',
      targetId: actorId,
      details: { provider: botProvider, enabled: Boolean(updates.enabled) },
    });

    return this.mapAdminSettings(this.ensureAdminSettings(botProvider));
  }

  async testAdminConnection(
    actorId: number,
    provider: string,
  ): Promise<AiBotConnectionCheckResponse> {
    const botProvider = this.normalizeProvider(provider);
    const settings = this.ensureAdminSettings(botProvider);
    const checkedAt = new Date().toISOString();

    try {
      const message =
        botProvider === 'telegram'
          ? await this.testTelegram(settings)
          : await this.testVk(settings);
      this.updateCheckState(botProvider, checkedAt, 'ok', null);
      this.activityService.record({
        actorId,
        userId: actorId,
        action: 'ai.bot.connection.check',
        targetType: 'ai_bot',
        targetId: actorId,
        details: { provider: botProvider, status: 'ok' },
      });
      return { ok: true, checkedAt, message };
    } catch (caught) {
      const message = (caught as Error).message.slice(0, 280);
      this.updateCheckState(botProvider, checkedAt, 'error', message);
      throw new BadRequestException(message);
    }
  }

  listUserSettings(userId: number): AiBotUserSettingsResponse[] {
    return botProviders.map((provider) =>
      this.mapUserSettings(this.ensureUserSettings(userId, provider)),
    );
  }

  updateUserSettings(
    userId: number,
    provider: string,
    dto: UpdateAiBotUserSettingsDto,
  ): AiBotUserSettingsResponse {
    const botProvider = this.normalizeProvider(provider);
    const current = this.ensureUserSettings(userId, botProvider);
    const nextAccessMode = dto.accessMode ?? current.access_mode;
    const nextDailyLimit = this.normalizeLimit(dto.dailyRequestLimit, current.daily_request_limit);
    const nextDailyReadLimit = this.normalizeLimit(dto.dailyReadLimit, current.daily_read_limit);
    const nextDailyWriteLimit = this.normalizeLimit(dto.dailyWriteLimit, current.daily_write_limit);
    const permissions = this.mergePermissions(this.mapRowPermissions(current), dto.permissions);
    const now = new Date().toISOString();

    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_bot_user_settings
          SET enabled = @enabled,
              access_mode = @accessMode,
              allow_secrets = @allowSecrets,
              allow_note_read = @allowNoteRead,
              allow_note_write = @allowNoteWrite,
              allow_note_delete = @allowNoteDelete,
              allow_tags = @allowTags,
              allow_templates = @allowTemplates,
              allow_versions = @allowVersions,
              allow_attachments = @allowAttachments,
              allow_share_links = @allowShareLinks,
              daily_request_limit = @dailyRequestLimit,
              daily_read_limit = @dailyReadLimit,
              daily_write_limit = @dailyWriteLimit,
              updated_at = @now
          WHERE user_id = @userId AND provider = @provider
        `,
      )
      .run({
        userId,
        provider: botProvider,
        enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
        accessMode: nextAccessMode,
        allowSecrets:
          dto.allowSecrets === undefined ? current.allow_secrets : dto.allowSecrets ? 1 : 0,
        allowNoteRead: permissions.readNotes ? 1 : 0,
        allowNoteWrite: permissions.writeNotes ? 1 : 0,
        allowNoteDelete: permissions.deleteNotes ? 1 : 0,
        allowTags: permissions.manageTags ? 1 : 0,
        allowTemplates: permissions.useTemplates ? 1 : 0,
        allowVersions: permissions.useVersions ? 1 : 0,
        allowAttachments: permissions.listAttachments ? 1 : 0,
        allowShareLinks: permissions.createShareLinks ? 1 : 0,
        dailyRequestLimit: nextDailyLimit,
        dailyReadLimit: nextDailyReadLimit,
        dailyWriteLimit: nextDailyWriteLimit,
        now,
      });

    return this.mapUserSettings(this.ensureUserSettings(userId, botProvider));
  }

  createLinkCode(userId: number, provider: AiBotProvider): AiBotLinkCodeResponse {
    const botProvider = this.normalizeProvider(provider);
    const now = new Date().toISOString();
    const code = this.createUniqueLinkCode(botProvider, now);
    const expiresAt = new Date(Date.now() + linkCodeTtlMs).toISOString();

    const transaction = this.databaseService.connection.transaction(() => {
      this.databaseService.connection
        .prepare(
          `
            DELETE FROM ai_bot_link_codes
            WHERE (user_id = @userId AND provider = @provider)
               OR expires_at <= @now
          `,
        )
        .run({ userId, provider: botProvider, now });

      this.databaseService.connection
        .prepare(
          `
            INSERT INTO ai_bot_link_codes (user_id, provider, code_hash, expires_at, created_at)
            VALUES (@userId, @provider, @codeHash, @expiresAt, @createdAt)
          `,
        )
        .run({
          userId,
          provider: botProvider,
          codeHash: this.hashLinkCode(code),
          expiresAt,
          createdAt: now,
        });
    });

    transaction();

    return { provider: botProvider, code, expiresAt };
  }

  private createUniqueLinkCode(provider: AiBotProvider, now: string): string {
    for (let attempt = 0; attempt < linkCodeMaxAttempts; attempt += 1) {
      const code = this.formatLinkCode(randomBytes(linkCodeBytes).toString('hex').toUpperCase());
      const existing = this.databaseService.connection
        .prepare(
          `
            SELECT id
            FROM ai_bot_link_codes
            WHERE provider = @provider
              AND code_hash = @codeHash
              AND expires_at > @now
            LIMIT 1
          `,
        )
        .get({
          provider,
          codeHash: this.hashLinkCode(code),
          now,
        }) as { id: number } | undefined;

      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Failed to create a unique bot link code');
  }

  private formatLinkCode(value: string): string {
    return value.match(/.{1,4}/g)?.join('-') ?? value;
  }

  getAdminSettings(provider: AiBotProvider): AiBotAdminSettingsRow {
    return this.ensureAdminSettings(provider);
  }

  getLinkedUserSettings(provider: AiBotProvider, externalId: string): AiBotUserSettingsRow | null {
    return (
      (this.databaseService.connection
        .prepare(
          `
            SELECT *
            FROM ai_bot_user_settings
            WHERE provider = @provider AND linked_external_id = @externalId
            ORDER BY linked_at DESC, id DESC
            LIMIT 1
          `,
        )
        .get({ provider, externalId }) as AiBotUserSettingsRow | undefined) ?? null
    );
  }

  linkExternalAccount(
    provider: AiBotProvider,
    code: string,
    externalId: string,
    username: string | null,
  ): AiBotUserSettingsResponse {
    const now = new Date().toISOString();
    const linkedToAnotherUser = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM ai_bot_user_settings
          WHERE provider = @provider
            AND linked_external_id = @externalId
          LIMIT 1
        `,
      )
      .get({ provider, externalId }) as AiBotUserSettingsRow | undefined;
    const linkCode = this.databaseService.connection
      .prepare(
        `
          SELECT *
          FROM ai_bot_link_codes
          WHERE provider = @provider
            AND code_hash = @codeHash
            AND expires_at > @now
          ORDER BY expires_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get({ provider, codeHash: this.hashLinkCode(code), now }) as
      | { id: number; user_id: number }
      | undefined;

    if (!linkCode) {
      throw new BadRequestException('Invalid or expired bot link code');
    }

    if (linkedToAnotherUser && linkedToAnotherUser.user_id !== linkCode.user_id) {
      throw new BadRequestException('This messenger account is already linked');
    }

    this.ensureUserSettings(linkCode.user_id, provider);
    const transaction = this.databaseService.connection.transaction(() => {
      this.databaseService.connection
        .prepare(
          `
            UPDATE ai_bot_user_settings
            SET enabled = 1,
                linked_external_id = @externalId,
                linked_username = @username,
                linked_at = @now,
                updated_at = @now
            WHERE user_id = @userId AND provider = @provider
          `,
        )
        .run({ userId: linkCode.user_id, provider, externalId, username, now });
      this.databaseService.connection
        .prepare(
          `
            DELETE FROM ai_bot_link_codes
            WHERE user_id = @userId AND provider = @provider
          `,
        )
        .run({ userId: linkCode.user_id, provider });
    });

    transaction();

    return this.mapUserSettings(this.ensureUserSettings(linkCode.user_id, provider));
  }

  private ensureAdminSettings(provider: AiBotProvider): AiBotAdminSettingsRow {
    const existing = this.databaseService.connection
      .prepare('SELECT * FROM ai_bot_admin_settings WHERE provider = ?')
      .get(provider) as AiBotAdminSettingsRow | undefined;

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO ai_bot_admin_settings (provider, created_at, updated_at)
          VALUES (@provider, @now, @now)
        `,
      )
      .run({ provider, now });

    return this.ensureAdminSettings(provider);
  }

  private ensureUserSettings(userId: number, provider: AiBotProvider): AiBotUserSettingsRow {
    const existing = this.databaseService.connection
      .prepare('SELECT * FROM ai_bot_user_settings WHERE user_id = ? AND provider = ?')
      .get(userId, provider) as AiBotUserSettingsRow | undefined;

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO ai_bot_user_settings (user_id, provider, created_at, updated_at)
          VALUES (@userId, @provider, @now, @now)
        `,
      )
      .run({ userId, provider, now });

    return this.ensureUserSettings(userId, provider);
  }

  private mapAdminSettings(row: AiBotAdminSettingsRow): AiBotAdminSettingsResponse {
    return {
      provider: row.provider,
      enabled: Boolean(row.enabled),
      webhookUrl: row.webhook_url,
      hasBotToken: Boolean(row.bot_token_encrypted),
      botTokenHint: this.createEncryptedHint(row.bot_token_encrypted),
      hasAccessToken: Boolean(row.access_token_encrypted),
      accessTokenHint: this.createEncryptedHint(row.access_token_encrypted),
      hasSecret: Boolean(row.secret_encrypted),
      secretHint: this.createEncryptedHint(row.secret_encrypted),
      groupId: row.group_id,
      confirmationCode: row.confirmation_code,
      allowSecrets: Boolean(row.allow_secrets),
      requireConfirmation: Boolean(row.require_confirmation),
      dailyRequestLimit: row.daily_request_limit,
      dailyReadLimit: row.daily_read_limit,
      dailyWriteLimit: row.daily_write_limit,
      lastCheckAt: row.last_check_at,
      lastCheckStatus: row.last_check_status,
      lastCheckError: row.last_check_error,
      updatedAt: row.updated_at,
    };
  }

  private createEncryptedHint(encrypted: string | null): string | null {
    const value = this.aiCryptoService.decrypt(encrypted);
    return value ? this.aiCryptoService.createHint(value) : null;
  }

  private mapUserSettings(row: AiBotUserSettingsRow): AiBotUserSettingsResponse {
    return {
      provider: row.provider,
      enabled: Boolean(row.enabled),
      accessMode: row.access_mode,
      allowSecrets: Boolean(row.allow_secrets),
      permissions: this.mapRowPermissions(row),
      dailyRequestLimit: row.daily_request_limit,
      dailyReadLimit: row.daily_read_limit,
      dailyWriteLimit: row.daily_write_limit,
      linkedExternalId: row.linked_external_id,
      linkedUsername: row.linked_username,
      linkedAt: row.linked_at,
    };
  }

  private mapRowPermissions(row: AiBotUserSettingsRow): AiBotPermissions {
    return {
      readNotes: Boolean(row.allow_note_read),
      writeNotes: Boolean(row.allow_note_write),
      deleteNotes: Boolean(row.allow_note_delete),
      manageTags: Boolean(row.allow_tags),
      useTemplates: Boolean(row.allow_templates),
      useVersions: Boolean(row.allow_versions),
      listAttachments: Boolean(row.allow_attachments),
      createShareLinks: Boolean(row.allow_share_links),
    };
  }

  private mergePermissions(
    current: AiBotPermissions,
    patch: Partial<AiBotPermissions> | undefined,
  ): AiBotPermissions {
    if (!patch) {
      return current;
    }

    return {
      readNotes: patch.readNotes ?? current.readNotes,
      writeNotes: patch.writeNotes ?? current.writeNotes,
      deleteNotes: patch.deleteNotes ?? current.deleteNotes,
      manageTags: patch.manageTags ?? current.manageTags,
      useTemplates: patch.useTemplates ?? current.useTemplates,
      useVersions: patch.useVersions ?? current.useVersions,
      listAttachments: patch.listAttachments ?? current.listAttachments,
      createShareLinks: patch.createShareLinks ?? current.createShareLinks,
    };
  }

  private applySecretUpdate(
    assignments: string[],
    updates: Record<string, unknown>,
    column: 'bot_token' | 'access_token' | 'secret',
    encryptedKey: 'botTokenEncrypted' | 'accessTokenEncrypted' | 'secretEncrypted',
    value: string | undefined,
    clear: boolean | undefined,
  ): void {
    const databaseColumn = `${column}_encrypted`;

    if (clear) {
      assignments.push(`${databaseColumn} = NULL`);
      return;
    }

    if (value?.trim()) {
      updates[encryptedKey] = this.aiCryptoService.encrypt(value.trim());
      assignments.push(`${databaseColumn} = @${encryptedKey}`);
    }
  }

  private async testTelegram(settings: AiBotAdminSettingsRow): Promise<string> {
    const token = this.aiCryptoService.decrypt(settings.bot_token_encrypted);

    if (!token) {
      throw new BadRequestException('Telegram bot token is not configured');
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { username?: string };
      description?: string;
    } | null;

    if (!response.ok || !payload?.ok) {
      throw new BadRequestException(payload?.description ?? `Telegram returned ${response.status}`);
    }

    return payload.result?.username ? `@${payload.result.username}` : 'Telegram bot is available';
  }

  private async testVk(settings: AiBotAdminSettingsRow): Promise<string> {
    const token = this.aiCryptoService.decrypt(settings.access_token_encrypted);

    if (!token || !settings.group_id) {
      throw new BadRequestException('VK group id and access token are required');
    }

    const url = new URL('https://api.vk.com/method/groups.getById');
    url.searchParams.set('group_id', settings.group_id);
    url.searchParams.set('access_token', token);
    url.searchParams.set('v', '5.199');

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const payload = (await response.json().catch(() => null)) as {
      response?: Array<{ name?: string }>;
      error?: { error_msg?: string };
    } | null;

    if (!response.ok || payload?.error || !payload?.response?.length) {
      throw new BadRequestException(payload?.error?.error_msg ?? `VK returned ${response.status}`);
    }

    return payload.response[0]?.name ?? 'VK group is available';
  }

  private updateCheckState(
    provider: AiBotProvider,
    checkedAt: string,
    status: 'ok' | 'error',
    error: string | null,
  ): void {
    this.databaseService.connection
      .prepare(
        `
          UPDATE ai_bot_admin_settings
          SET last_check_at = @checkedAt,
              last_check_status = @status,
              last_check_error = @error,
              updated_at = @checkedAt
          WHERE provider = @provider
        `,
      )
      .run({ provider, checkedAt, status, error });
  }

  private normalizeProvider(provider: string): AiBotProvider {
    if (provider === 'telegram' || provider === 'vk') {
      return provider;
    }

    throw new BadRequestException('Unsupported bot provider');
  }

  private normalizeNullable(value: string | null | undefined): string | null {
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

  private hashLinkCode(code: string): string {
    return createHash('sha256').update(this.normalizeLinkCode(code)).digest('hex');
  }

  private normalizeLinkCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
