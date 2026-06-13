import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { calculateAiUsageCostUsd, getAiModelPricing } from '../ai/ai-pricing';
import { currentMonthRangeIso } from '../database/db.util';
import type {
  AdminActivityDay,
  AdminActivityUser,
  AdminAiModelStat,
  AdminAiSpendUser,
  AdminFileTypeStat,
  AdminStatsRange,
  AdminStatsResponse,
  AdminStorageUser,
} from './admin.types';

const toNum = (value: unknown): number => Number(value ?? 0);

@Injectable()
export class AdminStatsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getStats(range?: string): Promise<AdminStatsResponse> {
    const activityRange = this.normalizeStatsRange(range);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const [row] = (await this.dataSource.query(
      `
        SELECT
          (SELECT COUNT(*) FROM users)::int as "usersTotal",
          (SELECT COUNT(*) FROM users WHERE role = 'admin')::int as "adminsTotal",
          (SELECT COUNT(*) FROM notes)::int as "notesTotal",
          (SELECT COUNT(*) FROM activity_logs)::int as "activityTotal",
          (SELECT MAX(last_login_at) FROM users) as "lastLoginAt",
          (SELECT COUNT(*) FROM users WHERE last_login_at >= $1)::int as "activeUsersToday",
          (SELECT COUNT(*) FROM activity_logs WHERE created_at >= $2)::int as "eventsLast24h",
          (SELECT COUNT(*) FROM attachments)::int as "attachmentsTotal",
          (SELECT COALESCE(SUM(size), 0) FROM attachments)::bigint as "attachmentsStorageBytes",
          (SELECT COUNT(*) FROM attachments WHERE note_id IS NULL)::int as "orphanAttachmentsTotal",
          (SELECT COALESCE(SUM(size), 0) FROM attachments WHERE note_id IS NULL)::bigint as "orphanAttachmentsBytes",
          (SELECT COALESCE(ROUND(AVG(size)), 0) FROM attachments)::bigint as "averageAttachmentBytes",
          (SELECT COALESCE(MAX(size), 0) FROM attachments)::bigint as "largestAttachmentBytes",
          (SELECT COUNT(DISTINCT note_id) FROM attachments WHERE note_id IS NOT NULL)::int as "notesWithAttachmentsTotal",
          (SELECT COUNT(*) FROM note_versions)::int as "noteVersionsTotal",
          (SELECT COUNT(*) FROM share_links WHERE revoked_at IS NULL AND expires_at > $3)::int as "shareLinksActiveTotal",
          (SELECT COUNT(*) FROM ai_user_settings WHERE enabled = 1)::int as "aiEnabledUsersTotal",
          (SELECT COUNT(DISTINCT user_id) FROM ai_provider_settings WHERE model IS NOT NULL AND trim(model) != '')::int as "aiSelectedModelsTotal",
          (SELECT COUNT(DISTINCT provider_name) FROM ai_provider_settings)::int as "aiProvidersTotal",
          (SELECT COUNT(*) FROM ai_provider_models WHERE is_deprecated = 0)::int as "aiSyncedModelsTotal",
          (SELECT COUNT(*) FROM ai_provider_models WHERE is_deprecated = 1)::int as "aiDeprecatedModelsTotal",
          (SELECT COUNT(*) FROM activity_logs WHERE action = 'ai.chat' AND created_at >= $2)::int as "aiChatsLast24h",
          (SELECT COUNT(*) FROM activity_logs WHERE action = 'ai.tool.execute' AND created_at >= $2)::int as "aiToolExecutionsLast24h",
          (SELECT COUNT(DISTINCT COALESCE(user_id, actor_id)) FROM activity_logs WHERE action LIKE 'ai.%' AND COALESCE(user_id, actor_id) IS NOT NULL AND created_at >= $2)::int as "aiActiveUsersLast24h",
          (SELECT MAX(last_models_sync_at) FROM ai_provider_settings) as "aiLastModelsSyncAt"
      `,
      [today, lastDay, nowIso],
    )) as Array<Record<string, unknown>>;

    return {
      usersTotal: toNum(row.usersTotal),
      adminsTotal: toNum(row.adminsTotal),
      notesTotal: toNum(row.notesTotal),
      activityTotal: toNum(row.activityTotal),
      lastLoginAt: (row.lastLoginAt as string | null) ?? null,
      activeUsersToday: toNum(row.activeUsersToday),
      eventsLast24h: toNum(row.eventsLast24h),
      attachmentsTotal: toNum(row.attachmentsTotal),
      attachmentsStorageBytes: toNum(row.attachmentsStorageBytes),
      orphanAttachmentsTotal: toNum(row.orphanAttachmentsTotal),
      orphanAttachmentsBytes: toNum(row.orphanAttachmentsBytes),
      averageAttachmentBytes: toNum(row.averageAttachmentBytes),
      largestAttachmentBytes: toNum(row.largestAttachmentBytes),
      notesWithAttachmentsTotal: toNum(row.notesWithAttachmentsTotal),
      noteVersionsTotal: toNum(row.noteVersionsTotal),
      shareLinksActiveTotal: toNum(row.shareLinksActiveTotal),
      aiEnabledUsersTotal: toNum(row.aiEnabledUsersTotal),
      aiSelectedModelsTotal: toNum(row.aiSelectedModelsTotal),
      aiProvidersTotal: toNum(row.aiProvidersTotal),
      aiSyncedModelsTotal: toNum(row.aiSyncedModelsTotal),
      aiDeprecatedModelsTotal: toNum(row.aiDeprecatedModelsTotal),
      aiChatsLast24h: toNum(row.aiChatsLast24h),
      aiToolExecutionsLast24h: toNum(row.aiToolExecutionsLast24h),
      aiActiveUsersLast24h: toNum(row.aiActiveUsersLast24h),
      aiLastModelsSyncAt: (row.aiLastModelsSyncAt as string | null) ?? null,
      activityRange,
      activityByDay: await this.getActivityByDay(activityRange),
      topStorageUsers: await this.getTopStorageUsers(),
      topActivityUsers: await this.getTopActivityUsers(),
      topAiModels: await this.getTopAiModels(),
      aiMonthlySpendUsers: await this.getAiMonthlySpendUsers(),
      fileTypes: await this.getFileTypes(),
    };
  }

  private normalizeStatsRange(range?: string): AdminStatsRange {
    return range === 'day' || range === 'month' || range === 'year' ? range : 'week';
  }

  private async getActivityByDay(range: AdminStatsRange): Promise<AdminActivityDay[]> {
    const buckets = this.getActivityBuckets(range);
    const rows = (await this.dataSource.query(
      `
        SELECT
          substr(created_at, 1, $1) as date,
          COUNT(*)::int as total,
          SUM(CASE WHEN action = 'auth.login' THEN 1 ELSE 0 END)::int as login,
          SUM(CASE WHEN action LIKE 'notes.%' THEN 1 ELSE 0 END)::int as notes,
          SUM(CASE WHEN action LIKE 'admin.%' THEN 1 ELSE 0 END)::int as admin,
          SUM(CASE WHEN action LIKE 'ai.%' THEN 1 ELSE 0 END)::int as ai
        FROM activity_logs
        WHERE created_at >= $2
        GROUP BY date
      `,
      [buckets.bucketLength, buckets.since],
    )) as AdminActivityDay[];
    const byDate = new Map(rows.map((row) => [row.date, row]));

    return buckets.keys.map(
      (date) => byDate.get(date) ?? { date, total: 0, login: 0, notes: 0, admin: 0, ai: 0 },
    );
  }

  private getActivityBuckets(range: AdminStatsRange): {
    keys: string[];
    since: string;
    bucketLength: number;
  } {
    if (range === 'day') {
      const keys = Array.from({ length: 24 }, (_, index) => {
        const date = new Date();
        date.setUTCMinutes(0, 0, 0);
        date.setUTCHours(date.getUTCHours() - (23 - index));
        return date.toISOString().slice(0, 13);
      });

      return { keys, since: `${keys[0]}:00:00.000Z`, bucketLength: 13 };
    }

    if (range === 'year') {
      const keys = Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setUTCDate(1);
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCMonth(date.getUTCMonth() - (11 - index));
        return date.toISOString().slice(0, 7);
      });

      return { keys, since: `${keys[0]}-01T00:00:00.000Z`, bucketLength: 7 };
    }

    const length = range === 'month' ? 30 : 7;
    const keys = Array.from({ length }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (length - 1 - index));
      return date.toISOString().slice(0, 10);
    });

    return { keys, since: `${keys[0]}T00:00:00.000Z`, bucketLength: 10 };
  }

  private async getTopStorageUsers(): Promise<AdminStorageUser[]> {
    const rows = (await this.dataSource.query(
      `
        SELECT
          users.username as username,
          COUNT(attachments.id)::int as "filesTotal",
          COALESCE(SUM(attachments.size), 0)::bigint as "storageBytes"
        FROM attachments
        INNER JOIN users ON users.id = attachments.user_id
        GROUP BY users.id
        ORDER BY "storageBytes" DESC, "filesTotal" DESC, users.username ASC
        LIMIT 10
      `,
    )) as Array<{ username: string; filesTotal: number; storageBytes: string | number }>;
    return rows.map((row) => ({
      username: row.username,
      filesTotal: toNum(row.filesTotal),
      storageBytes: toNum(row.storageBytes),
    }));
  }

  private async getTopActivityUsers(): Promise<AdminActivityUser[]> {
    const rows = (await this.dataSource.query(
      `
        SELECT
          COALESCE(target_user.username, actor.username, 'unknown') as username,
          COUNT(activity_logs.id)::int as "eventsTotal"
        FROM activity_logs
        LEFT JOIN users target_user ON target_user.id = activity_logs.user_id
        LEFT JOIN users actor ON actor.id = activity_logs.actor_id
        GROUP BY COALESCE(target_user.username, actor.username, 'unknown')
        ORDER BY "eventsTotal" DESC, username ASC
        LIMIT 10
      `,
    )) as Array<{ username: string; eventsTotal: number }>;
    return rows.map((row) => ({ username: row.username, eventsTotal: toNum(row.eventsTotal) }));
  }

  private async getFileTypes(): Promise<AdminFileTypeStat[]> {
    const rows = (await this.dataSource.query(
      `
        SELECT
          CASE
            WHEN mime_type LIKE 'image/%' THEN 'image'
            WHEN mime_type LIKE 'video/%' THEN 'video'
            WHEN mime_type LIKE 'audio/%' THEN 'audio'
            WHEN mime_type = 'application/pdf' THEN 'pdf'
            WHEN mime_type LIKE 'text/%' THEN 'text'
            WHEN mime_type IN ('application/zip', 'application/x-zip-compressed') THEN 'archive'
            ELSE 'other'
          END as type,
          COUNT(*)::int as "filesTotal",
          COALESCE(SUM(size), 0)::bigint as "storageBytes"
        FROM attachments
        GROUP BY type
        ORDER BY "storageBytes" DESC, "filesTotal" DESC, type ASC
      `,
    )) as Array<{ type: string; filesTotal: number; storageBytes: string | number }>;
    return rows.map((row) => ({
      type: row.type,
      filesTotal: toNum(row.filesTotal),
      storageBytes: toNum(row.storageBytes),
    }));
  }

  private async getTopAiModels(): Promise<AdminAiModelStat[]> {
    const rows = (await this.dataSource.query(
      `
        SELECT
          model,
          COUNT(DISTINCT user_id)::int as "usersTotal"
        FROM ai_provider_settings
        WHERE model IS NOT NULL AND trim(model) != ''
        GROUP BY model
        ORDER BY "usersTotal" DESC, lower(model) ASC
        LIMIT 10
      `,
    )) as Array<{ model: string; usersTotal: number }>;
    return rows.map((row) => ({ model: row.model, usersTotal: toNum(row.usersTotal) }));
  }

  private async getAiMonthlySpendUsers(): Promise<AdminAiSpendUser[]> {
    const { start: monthStart, end: monthEnd } = currentMonthRangeIso();
    const rows = (await this.dataSource.query(
      `
        SELECT
          users.id as "userId",
          users.username,
          ai_usage_logs.provider_name as "providerName",
          ai_usage_logs.model,
          COUNT(*)::int as requests,
          COALESCE(SUM(ai_usage_logs.input_tokens), 0)::bigint as "inputTokens",
          COALESCE(SUM(ai_usage_logs.output_tokens), 0)::bigint as "outputTokens",
          MAX(ai_provider_models.input_price_per_1m) as "inputPricePer1M",
          MAX(ai_provider_models.cached_input_price_per_1m) as "cachedInputPricePer1M",
          MAX(ai_provider_models.output_price_per_1m) as "outputPricePer1M"
        FROM ai_usage_logs
        INNER JOIN users ON users.id = ai_usage_logs.user_id
        LEFT JOIN ai_provider_models
          ON ai_provider_models.user_id = ai_usage_logs.user_id
         AND ai_provider_models.provider_name = ai_usage_logs.provider_name
         AND ai_provider_models.model_id = ai_usage_logs.model
        WHERE ai_usage_logs.created_at >= $1 AND ai_usage_logs.created_at < $2
        GROUP BY users.id, ai_usage_logs.provider_name, ai_usage_logs.model
        ORDER BY users.username ASC, requests DESC, lower(ai_usage_logs.model) ASC
      `,
      [monthStart, monthEnd],
    )) as Array<{
      userId: number;
      username: string;
      providerName: string;
      model: string;
      requests: number | string;
      inputTokens: number | string;
      outputTokens: number | string;
      inputPricePer1M: number | string | null;
      cachedInputPricePer1M: number | string | null;
      outputPricePer1M: number | string | null;
    }>;
    const users = new Map<number, AdminAiSpendUser>();

    for (const raw of rows) {
      const requests = toNum(raw.requests);
      const inputTokens = toNum(raw.inputTokens);
      const outputTokens = toNum(raw.outputTokens);
      const fallbackPricing = getAiModelPricing(raw.model);
      const pricing = {
        inputPricePer1M:
          raw.inputPricePer1M === null ? fallbackPricing.inputPricePer1M : Number(raw.inputPricePer1M),
        cachedInputPricePer1M:
          raw.cachedInputPricePer1M === null
            ? fallbackPricing.cachedInputPricePer1M
            : Number(raw.cachedInputPricePer1M),
        outputPricePer1M:
          raw.outputPricePer1M === null
            ? fallbackPricing.outputPricePer1M
            : Number(raw.outputPricePer1M),
      };
      const costUsd = calculateAiUsageCostUsd(inputTokens, outputTokens, pricing);
      const user =
        users.get(raw.userId) ??
        ({
          userId: raw.userId,
          username: raw.username,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          tokens: 0,
          knownCostUsd: 0,
          hasUnknownCost: false,
          models: [],
        } satisfies AdminAiSpendUser);

      user.requests += requests;
      user.inputTokens += inputTokens;
      user.outputTokens += outputTokens;
      user.tokens += inputTokens + outputTokens;
      if (costUsd === null) {
        user.hasUnknownCost = true;
      } else {
        user.knownCostUsd += costUsd;
      }
      user.models.push({
        providerName: raw.providerName,
        model: raw.model,
        requests,
        inputTokens,
        outputTokens,
        tokens: inputTokens + outputTokens,
        costUsd,
      });
      users.set(raw.userId, user);
    }

    return [...users.values()].sort(
      (left, right) =>
        right.knownCostUsd - left.knownCostUsd ||
        right.tokens - left.tokens ||
        left.username.localeCompare(right.username),
    );
  }
}
