import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { nowIso } from '../database/db.util';
import {
  AiBotAdminSettingsEntity,
  AiBotLinkCodeEntity,
  AiBotUserSettingsEntity,
} from '../database/entities/ai-bot.entity';
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
    @InjectRepository(AiBotAdminSettingsEntity)
    private readonly adminRepo: Repository<AiBotAdminSettingsEntity>,
    @InjectRepository(AiBotUserSettingsEntity)
    private readonly userRepo: Repository<AiBotUserSettingsEntity>,
    @InjectRepository(AiBotLinkCodeEntity)
    private readonly linkCodesRepo: Repository<AiBotLinkCodeEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AiCryptoService) private readonly aiCryptoService: AiCryptoService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  async listAdminSettings(): Promise<AiBotAdminSettingsResponse[]> {
    const rows = await Promise.all(botProviders.map((provider) => this.ensureAdminSettings(provider)));
    return rows.map((row) => this.mapAdminSettings(row));
  }

  async updateAdminSettings(
    actorId: number,
    provider: string,
    dto: UpdateAiBotAdminSettingsDto,
  ): Promise<AiBotAdminSettingsResponse> {
    const botProvider = this.normalizeProvider(provider);
    const current = await this.ensureAdminSettings(botProvider);
    const updates: Partial<AiBotAdminSettingsEntity> = {
      enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
      webhook_url:
        dto.webhookUrl === undefined ? current.webhook_url : this.normalizeNullable(dto.webhookUrl),
      group_id: dto.groupId === undefined ? current.group_id : this.normalizeNullable(dto.groupId),
      confirmation_code:
        dto.confirmationCode === undefined
          ? current.confirmation_code
          : this.normalizeNullable(dto.confirmationCode),
      allow_secrets:
        dto.allowSecrets === undefined ? current.allow_secrets : dto.allowSecrets ? 1 : 0,
      require_confirmation:
        dto.requireConfirmation === undefined
          ? current.require_confirmation
          : dto.requireConfirmation
            ? 1
            : 0,
      daily_request_limit: this.normalizeLimit(dto.dailyRequestLimit, current.daily_request_limit),
      daily_read_limit: this.normalizeLimit(dto.dailyReadLimit, current.daily_read_limit),
      daily_write_limit: this.normalizeLimit(dto.dailyWriteLimit, current.daily_write_limit),
      updated_at: nowIso(),
    };

    this.applySecretUpdate(updates, 'bot_token_encrypted', dto.botToken, dto.clearBotToken);
    this.applySecretUpdate(updates, 'access_token_encrypted', dto.accessToken, dto.clearAccessToken);
    this.applySecretUpdate(updates, 'secret_encrypted', dto.secret, dto.clearSecret);

    await this.adminRepo.update({ provider: botProvider }, updates);

    await this.activityService.record({
      actorId,
      userId: actorId,
      action: 'ai.bot.settings.update',
      targetType: 'ai_bot',
      targetId: actorId,
      details: { provider: botProvider, enabled: Boolean(updates.enabled) },
    });

    return this.mapAdminSettings(await this.ensureAdminSettings(botProvider));
  }

  async testAdminConnection(
    actorId: number,
    provider: string,
  ): Promise<AiBotConnectionCheckResponse> {
    const botProvider = this.normalizeProvider(provider);
    const settings = await this.ensureAdminSettings(botProvider);
    const checkedAt = nowIso();

    try {
      const message =
        botProvider === 'telegram'
          ? await this.testTelegram(settings)
          : await this.testVk(settings);
      await this.updateCheckState(botProvider, checkedAt, 'ok', null);
      await this.activityService.record({
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
      await this.updateCheckState(botProvider, checkedAt, 'error', message);
      throw new BadRequestException(message);
    }
  }

  async listUserSettings(userId: number): Promise<AiBotUserSettingsResponse[]> {
    const rows = await Promise.all(
      botProviders.map((provider) => this.ensureUserSettings(userId, provider)),
    );
    return rows.map((row) => this.mapUserSettings(row));
  }

  async updateUserSettings(
    userId: number,
    provider: string,
    dto: UpdateAiBotUserSettingsDto,
  ): Promise<AiBotUserSettingsResponse> {
    const botProvider = this.normalizeProvider(provider);
    const current = await this.ensureUserSettings(userId, botProvider);
    const nextAccessMode = dto.accessMode ?? current.access_mode;
    const permissions = this.mergePermissions(this.mapRowPermissions(current), dto.permissions);

    await this.userRepo.update(
      { user_id: userId, provider: botProvider },
      {
        enabled: dto.enabled === undefined ? current.enabled : dto.enabled ? 1 : 0,
        access_mode: nextAccessMode,
        allow_secrets:
          dto.allowSecrets === undefined ? current.allow_secrets : dto.allowSecrets ? 1 : 0,
        allow_note_read: permissions.readNotes ? 1 : 0,
        allow_note_write: permissions.writeNotes ? 1 : 0,
        allow_note_delete: permissions.deleteNotes ? 1 : 0,
        allow_tags: permissions.manageTags ? 1 : 0,
        allow_templates: permissions.useTemplates ? 1 : 0,
        allow_versions: permissions.useVersions ? 1 : 0,
        allow_attachments: permissions.listAttachments ? 1 : 0,
        allow_share_links: permissions.createShareLinks ? 1 : 0,
        daily_request_limit: this.normalizeLimit(dto.dailyRequestLimit, current.daily_request_limit),
        daily_read_limit: this.normalizeLimit(dto.dailyReadLimit, current.daily_read_limit),
        daily_write_limit: this.normalizeLimit(dto.dailyWriteLimit, current.daily_write_limit),
        updated_at: nowIso(),
      },
    );

    return this.mapUserSettings(await this.ensureUserSettings(userId, botProvider));
  }

  async createLinkCode(userId: number, provider: AiBotProvider): Promise<AiBotLinkCodeResponse> {
    const botProvider = this.normalizeProvider(provider);
    const now = nowIso();
    const code = await this.createUniqueLinkCode(botProvider, now);
    const expiresAt = new Date(Date.now() + linkCodeTtlMs).toISOString();

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(AiBotLinkCodeEntity)
        .where('(user_id = :userId AND provider = :provider) OR expires_at <= :now', {
          userId,
          provider: botProvider,
          now,
        })
        .execute();

      await manager.insert(AiBotLinkCodeEntity, {
        user_id: userId,
        provider: botProvider,
        code_hash: this.hashLinkCode(code),
        expires_at: expiresAt,
        created_at: now,
      });
    });

    return { provider: botProvider, code, expiresAt };
  }

  private async createUniqueLinkCode(provider: AiBotProvider, now: string): Promise<string> {
    for (let attempt = 0; attempt < linkCodeMaxAttempts; attempt += 1) {
      const code = this.formatLinkCode(randomBytes(linkCodeBytes).toString('hex').toUpperCase());
      const exists = await this.linkCodesRepo
        .createQueryBuilder('c')
        .where('c.provider = :provider', { provider })
        .andWhere('c.code_hash = :codeHash', { codeHash: this.hashLinkCode(code) })
        .andWhere('c.expires_at > :now', { now })
        .getExists();

      if (!exists) {
        return code;
      }
    }

    throw new BadRequestException('Failed to create a unique bot link code');
  }

  private formatLinkCode(value: string): string {
    return value.match(/.{1,4}/g)?.join('-') ?? value;
  }

  getAdminSettings(provider: AiBotProvider): Promise<AiBotAdminSettingsRow> {
    return this.ensureAdminSettings(provider);
  }

  async getLinkedUserSettings(
    provider: AiBotProvider,
    externalId: string,
  ): Promise<AiBotUserSettingsRow | null> {
    const row = await this.userRepo
      .createQueryBuilder('s')
      .where('s.provider = :provider', { provider })
      .andWhere('s.linked_external_id = :externalId', { externalId })
      .orderBy('s.linked_at', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .getOne();

    return (row as unknown as AiBotUserSettingsRow | null) ?? null;
  }

  async linkExternalAccount(
    provider: AiBotProvider,
    code: string,
    externalId: string,
    username: string | null,
  ): Promise<AiBotUserSettingsResponse> {
    const now = nowIso();
    const linkedToAnotherUser = await this.userRepo.findOne({
      where: { provider, linked_external_id: externalId },
    });
    const linkCode = await this.linkCodesRepo
      .createQueryBuilder('c')
      .where('c.provider = :provider', { provider })
      .andWhere('c.code_hash = :codeHash', { codeHash: this.hashLinkCode(code) })
      .andWhere('c.expires_at > :now', { now })
      .orderBy('c.expires_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .getOne();

    if (!linkCode) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired bot link code',
        code: 'BOT_LINK_INVALID',
      });
    }

    if (linkedToAnotherUser && linkedToAnotherUser.user_id !== linkCode.user_id) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'This messenger account is already linked',
        code: 'BOT_ALREADY_LINKED',
      });
    }

    await this.ensureUserSettings(linkCode.user_id, provider);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        AiBotUserSettingsEntity,
        { user_id: linkCode.user_id, provider },
        {
          enabled: 1,
          linked_external_id: externalId,
          linked_username: username,
          linked_at: now,
          updated_at: now,
        },
      );
      await manager.delete(AiBotLinkCodeEntity, { user_id: linkCode.user_id, provider });
    });

    return this.mapUserSettings(await this.ensureUserSettings(linkCode.user_id, provider));
  }

  private async ensureAdminSettings(provider: AiBotProvider): Promise<AiBotAdminSettingsRow> {
    const existing = await this.adminRepo.findOne({ where: { provider } });
    if (existing) {
      return existing as unknown as AiBotAdminSettingsRow;
    }

    await this.adminRepo
      .createQueryBuilder()
      .insert()
      .into(AiBotAdminSettingsEntity)
      .values({ provider })
      .orIgnore()
      .execute();

    const created = await this.adminRepo.findOneOrFail({ where: { provider } });
    return created as unknown as AiBotAdminSettingsRow;
  }

  private async ensureUserSettings(
    userId: number,
    provider: AiBotProvider,
  ): Promise<AiBotUserSettingsRow> {
    const existing = await this.userRepo.findOne({ where: { user_id: userId, provider } });
    if (existing) {
      return existing as unknown as AiBotUserSettingsRow;
    }

    await this.userRepo
      .createQueryBuilder()
      .insert()
      .into(AiBotUserSettingsEntity)
      .values({ user_id: userId, provider })
      .orIgnore()
      .execute();

    const created = await this.userRepo.findOneOrFail({ where: { user_id: userId, provider } });
    return created as unknown as AiBotUserSettingsRow;
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
    updates: Partial<AiBotAdminSettingsEntity>,
    column: 'bot_token_encrypted' | 'access_token_encrypted' | 'secret_encrypted',
    value: string | undefined,
    clear: boolean | undefined,
  ): void {
    if (clear) {
      updates[column] = null;
      return;
    }

    if (value?.trim()) {
      updates[column] = this.aiCryptoService.encrypt(value.trim());
    }
  }

  private async testTelegram(settings: AiBotAdminSettingsRow): Promise<string> {
    const token = this.aiCryptoService.decrypt(settings.bot_token_encrypted);

    if (!token) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Telegram bot token is not configured',
        code: 'BOT_TOKEN_MISSING',
      });
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
      throw new BadRequestException({
        statusCode: 400,
        message: 'VK group id and access token are required',
        code: 'BOT_TOKEN_MISSING',
      });
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

  private async updateCheckState(
    provider: AiBotProvider,
    checkedAt: string,
    status: 'ok' | 'error',
    error: string | null,
  ): Promise<void> {
    await this.adminRepo.update(
      { provider },
      {
        last_check_at: checkedAt,
        last_check_status: status,
        last_check_error: error,
        updated_at: checkedAt,
      },
    );
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
