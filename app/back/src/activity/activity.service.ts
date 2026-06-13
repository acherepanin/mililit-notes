import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityLogEntity } from '../database/entities/activity.entity';
import { UserEntity } from '../database/entities/user.entity';
import { isRecord } from '../utils/type-guards';
import type { ActivityRecord, ActivityResponse, RecordActivityParams } from './activity.types';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityLogEntity)
    private readonly activityRepo: Repository<ActivityLogEntity>,
  ) {}

  async record({
    actorId,
    userId,
    action,
    targetType,
    targetId,
    details = {},
  }: RecordActivityParams): Promise<void> {
    await this.activityRepo.insert({
      actor_id: actorId,
      user_id: userId,
      action,
      target_type: targetType,
      target_id: targetId,
      details: JSON.stringify(details),
      created_at: new Date().toISOString(),
    });
  }

  async list(limit = 100, options?: { excludeSubscription?: boolean }): Promise<ActivityResponse[]> {
    const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100;
    const excludeSubscription = options?.excludeSubscription ?? false;

    const qb = this.activityRepo
      .createQueryBuilder('a')
      .leftJoin(UserEntity, 'actor', 'actor.id = a.actor_id')
      .leftJoin(UserEntity, 'target_user', 'target_user.id = a.user_id')
      .select('a.id', 'id')
      .addSelect('a.actor_id', 'actor_id')
      .addSelect('a.user_id', 'user_id')
      .addSelect('a.action', 'action')
      .addSelect('a.target_type', 'target_type')
      .addSelect('a.target_id', 'target_id')
      .addSelect('a.details', 'details')
      .addSelect('a.created_at', 'created_at')
      .addSelect('actor.username', 'actor_username')
      .addSelect('target_user.username', 'user_username');

    if (excludeSubscription) {
      qb.where("a.action NOT LIKE 'subscription.%'");
    }

    const rows = (await qb
      .orderBy('a.created_at', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .limit(normalizedLimit)
      .getRawMany()) as ActivityRecord[];

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
      const parsed: unknown = JSON.parse(details);

      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}
