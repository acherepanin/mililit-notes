import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../infra/database.service';
import type {
  AdminActivityDay,
  AdminActivityUser,
  AdminAiModelStat,
  AdminFileTypeStat,
  AdminStatsRange,
  AdminStatsResponse,
  AdminStorageUser,
} from './admin.types';

@Injectable()
export class AdminStatsService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  getStats(range?: string): AdminStatsResponse {
    const activityRange = this.normalizeStatsRange(range);
    const now = new Date();
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM users) as usersTotal,
            (SELECT COUNT(*) FROM users WHERE role = 'admin') as adminsTotal,
            (SELECT COUNT(*) FROM notes) as notesTotal,
            (SELECT COUNT(*) FROM activity_logs) as activityTotal,
            (SELECT MAX(last_login_at) FROM users) as lastLoginAt,
            (SELECT COUNT(*) FROM users WHERE last_login_at >= @today) as activeUsersToday,
            (SELECT COUNT(*) FROM activity_logs WHERE created_at >= @lastDay) as eventsLast24h,
            (SELECT COUNT(*) FROM attachments) as attachmentsTotal,
            (SELECT COALESCE(SUM(size), 0) FROM attachments) as attachmentsStorageBytes,
            (SELECT COUNT(*) FROM attachments WHERE note_id IS NULL) as orphanAttachmentsTotal,
            (SELECT COALESCE(SUM(size), 0) FROM attachments WHERE note_id IS NULL) as orphanAttachmentsBytes,
            (SELECT COALESCE(ROUND(AVG(size)), 0) FROM attachments) as averageAttachmentBytes,
            (SELECT COALESCE(MAX(size), 0) FROM attachments) as largestAttachmentBytes,
            (SELECT COUNT(DISTINCT note_id) FROM attachments WHERE note_id IS NOT NULL) as notesWithAttachmentsTotal,
            (SELECT COUNT(*) FROM note_versions) as noteVersionsTotal,
            (SELECT COUNT(*) FROM share_links WHERE revoked_at IS NULL AND expires_at > @now) as shareLinksActiveTotal,
            (SELECT COUNT(*) FROM ai_user_settings WHERE enabled = 1) as aiEnabledUsersTotal,
            (SELECT COUNT(*) FROM ai_user_settings WHERE model IS NOT NULL AND trim(model) != '') as aiSelectedModelsTotal,
            (SELECT COUNT(DISTINCT provider_name) FROM ai_user_settings) as aiProvidersTotal,
            (SELECT COUNT(*) FROM ai_provider_models WHERE is_deprecated = 0) as aiSyncedModelsTotal,
            (SELECT COUNT(*) FROM ai_provider_models WHERE is_deprecated = 1) as aiDeprecatedModelsTotal,
            (SELECT COUNT(*) FROM activity_logs WHERE action = 'ai.chat' AND created_at >= @lastDay) as aiChatsLast24h,
            (SELECT COUNT(*) FROM activity_logs WHERE action = 'ai.tool.execute' AND created_at >= @lastDay) as aiToolExecutionsLast24h,
            (SELECT COUNT(DISTINCT COALESCE(user_id, actor_id)) FROM activity_logs WHERE action LIKE 'ai.%' AND COALESCE(user_id, actor_id) IS NOT NULL AND created_at >= @lastDay) as aiActiveUsersLast24h,
            (SELECT MAX(last_models_sync_at) FROM ai_user_settings) as aiLastModelsSyncAt
        `,
      )
      .get({
        lastDay: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        now: now.toISOString(),
        today: now.toISOString().slice(0, 10),
      }) as Omit<
      AdminStatsResponse,
      | 'activityRange'
      | 'activityByDay'
      | 'topStorageUsers'
      | 'topActivityUsers'
      | 'topAiModels'
      | 'fileTypes'
    >;

    return {
      ...row,
      activityRange,
      activityByDay: this.getActivityByDay(activityRange),
      topStorageUsers: this.getTopStorageUsers(),
      topActivityUsers: this.getTopActivityUsers(),
      topAiModels: this.getTopAiModels(),
      fileTypes: this.getFileTypes(),
    };
  }

  private normalizeStatsRange(range?: string): AdminStatsRange {
    return range === 'day' || range === 'month' || range === 'year' ? range : 'week';
  }

  private getActivityByDay(range: AdminStatsRange): AdminActivityDay[] {
    const buckets = this.getActivityBuckets(range);
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT
            substr(created_at, 1, @bucketLength) as date,
            COUNT(*) as total,
            SUM(CASE WHEN action = 'auth.login' THEN 1 ELSE 0 END) as login,
            SUM(CASE WHEN action LIKE 'notes.%' THEN 1 ELSE 0 END) as notes,
            SUM(CASE WHEN action LIKE 'admin.%' THEN 1 ELSE 0 END) as admin,
            SUM(CASE WHEN action LIKE 'ai.%' THEN 1 ELSE 0 END) as ai
          FROM activity_logs
          WHERE created_at >= @since
          GROUP BY date
        `,
      )
      .all({ bucketLength: buckets.bucketLength, since: buckets.since }) as AdminActivityDay[];
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

  private getTopStorageUsers(): AdminStorageUser[] {
    return this.databaseService.connection
      .prepare(
        `
          SELECT
            users.username as username,
            COUNT(attachments.id) as filesTotal,
            COALESCE(SUM(attachments.size), 0) as storageBytes
          FROM attachments
          INNER JOIN users ON users.id = attachments.user_id
          GROUP BY users.id
          ORDER BY storageBytes DESC, filesTotal DESC, users.username ASC
          LIMIT 5
        `,
      )
      .all() as AdminStorageUser[];
  }

  private getTopActivityUsers(): AdminActivityUser[] {
    return this.databaseService.connection
      .prepare(
        `
          SELECT
            COALESCE(target_user.username, actor.username, 'unknown') as username,
            COUNT(activity_logs.id) as eventsTotal
          FROM activity_logs
          LEFT JOIN users target_user ON target_user.id = activity_logs.user_id
          LEFT JOIN users actor ON actor.id = activity_logs.actor_id
          GROUP BY COALESCE(target_user.username, actor.username, 'unknown')
          ORDER BY eventsTotal DESC, username ASC
          LIMIT 5
        `,
      )
      .all() as AdminActivityUser[];
  }

  private getFileTypes(): AdminFileTypeStat[] {
    return this.databaseService.connection
      .prepare(
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
            COUNT(*) as filesTotal,
            COALESCE(SUM(size), 0) as storageBytes
          FROM attachments
          GROUP BY type
          ORDER BY storageBytes DESC, filesTotal DESC, type ASC
        `,
      )
      .all() as AdminFileTypeStat[];
  }

  private getTopAiModels(): AdminAiModelStat[] {
    return this.databaseService.connection
      .prepare(
        `
          SELECT
            model,
            COUNT(*) as usersTotal
          FROM ai_user_settings
          WHERE model IS NOT NULL AND trim(model) != ''
          GROUP BY model
          ORDER BY usersTotal DESC, lower(model) ASC
          LIMIT 5
        `,
      )
      .all() as AdminAiModelStat[];
  }
}
