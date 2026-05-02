import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../infra/database.service';
import type { ActivityRecord, ActivityResponse, RecordActivityParams } from './activity.types';

@Injectable()
export class ActivityService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  record({
    actorId,
    userId,
    action,
    targetType,
    targetId,
    details = {},
  }: RecordActivityParams): void {
    this.databaseService.connection
      .prepare(
        `
          INSERT INTO activity_logs (actor_id, user_id, action, target_type, target_id, details, created_at)
          VALUES (@actorId, @userId, @action, @targetType, @targetId, @details, @createdAt)
        `,
      )
      .run({
        actorId,
        userId,
        action,
        targetType,
        targetId,
        details: JSON.stringify(details),
        createdAt: new Date().toISOString(),
      });
  }

  list(limit = 80): ActivityResponse[] {
    const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 80;
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT
            activity_logs.*,
            actor.username as actor_username,
            target_user.username as user_username
          FROM activity_logs
          LEFT JOIN users actor ON actor.id = activity_logs.actor_id
          LEFT JOIN users target_user ON target_user.id = activity_logs.user_id
          ORDER BY activity_logs.created_at DESC, activity_logs.id DESC
          LIMIT @limit
        `,
      )
      .all({ limit: normalizedLimit }) as ActivityRecord[];

    return rows.map((row) => this.mapActivity(row));
  }

  private mapActivity(row: ActivityRecord): ActivityResponse {
    return {
      id: row.id,
      actorId: row.actor_id,
      actorUsername: row.actor_username,
      userId: row.user_id,
      userUsername: row.user_username,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: this.parseDetails(row.details),
      createdAt: row.created_at,
    };
  }

  private parseDetails(details: string): Record<string, unknown> {
    try {
      return JSON.parse(details) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
