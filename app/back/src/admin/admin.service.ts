import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ActivityService } from '../activity/activity.service';
import { hashPassword } from '../auth/password';
import {
  assertValidEmail,
  assertValidPassword,
  assertValidUsername,
  normalizeUsername,
} from '../auth/username.util';
import { AttachmentFilesService } from '../infra/attachment-files.service';
import { DatabaseService } from '../infra/database.service';
import { AdminStatsService } from './admin-stats.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { AdminStatsResponse, AdminUserRecord, AdminUserResponse } from './admin.types';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AttachmentFilesService)
    private readonly attachmentFilesService: AttachmentFilesService,
    @Inject(AdminStatsService) private readonly adminStatsService: AdminStatsService,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
  ) {}

  listUsers(): AdminUserResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT
            users.*,
            (
              SELECT COUNT(*)
              FROM notes
              WHERE notes.user_id = users.id
            ) AS notes_count,
            (
              SELECT us.plan_id
              FROM user_subscriptions us
              WHERE us.user_id = users.id
                AND us.status = 'active'
                AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
              ORDER BY us.id DESC
              LIMIT 1
            ) AS subscription_plan_id,
            (
              SELECT sp.name
              FROM user_subscriptions us
              INNER JOIN subscription_plans sp ON sp.id = us.plan_id
              WHERE us.user_id = users.id
                AND us.status = 'active'
                AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
              ORDER BY us.id DESC
              LIMIT 1
            ) AS subscription_plan_name,
            (
              SELECT sp.icon_key
              FROM user_subscriptions us
              INNER JOIN subscription_plans sp ON sp.id = us.plan_id
              WHERE us.user_id = users.id
                AND us.status = 'active'
                AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
              ORDER BY us.id DESC
              LIMIT 1
            ) AS subscription_plan_icon_key
          FROM users
          ORDER BY lower(users.username) ASC
        `,
      )
      .all() as AdminUserRecord[];

    return rows.map((row) => this.mapUser(row));
  }

  createUser(actorId: number, dto: CreateUserDto): AdminUserResponse {
    const username = normalizeUsername(dto.username);
    const email = dto.email.trim().toLowerCase();
    assertValidUsername(username);
    assertValidPassword(dto.password);
    assertValidEmail(email);
    this.ensureUsernameAvailable(username);
    this.ensureEmailAvailable(email);

    const now = new Date().toISOString();
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, language, theme, email, created_at, updated_at)
          VALUES (@username, @passwordHash, @role, @language, @theme, @email, @now, @now)
        `,
      )
      .run({
        username,
        passwordHash: hashPassword(dto.password),
        role: dto.role ?? 'user',
        language: dto.language ?? 'ru',
        theme: dto.theme ?? 'dark',
        email,
        now,
      });
    const user = this.getUserById(Number(result.lastInsertRowid));
    this.subscriptionsService.ensureDefaultSubscription(user.id);
    this.activityService.record({
      actorId,
      userId: user.id,
      action: 'admin.user.create',
      targetType: 'user',
      targetId: user.id,
      details: { username: user.username, role: user.role },
    });

    return user;
  }

  updateUser(actorId: number, id: number, dto: UpdateUserDto): AdminUserResponse {
    const existingUser = this.getUserById(id);
    if (dto.role === 'user' && existingUser.role === 'admin' && this.countAdmins() <= 1) {
      throw new BadRequestException('At least one admin is required');
    }

    const fields: string[] = ['updated_at = @updatedAt'];
    const params: Record<string, string | number> = {
      id,
      updatedAt: new Date().toISOString(),
    };

    if (dto.password !== undefined) {
      fields.push('password_hash = @passwordHash');
      params.passwordHash = hashPassword(dto.password);
    }

    if (dto.role !== undefined) {
      fields.push('role = @role');
      params.role = dto.role;
    }

    this.databaseService.connection
      .prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = @id`)
      .run(params);
    const user = this.getUserById(id);
    this.activityService.record({
      actorId,
      userId: user.id,
      action: 'admin.user.update',
      targetType: 'user',
      targetId: user.id,
      details: { username: user.username, role: user.role },
    });

    return user;
  }

  deleteUser(actorId: number, id: number): { id: number } {
    if (actorId === id) {
      throw new BadRequestException('Admin cannot delete own account');
    }

    const user = this.getUserById(id);
    this.activityService.record({
      actorId,
      userId: id,
      action: 'admin.user.delete',
      targetType: 'user',
      targetId: id,
      details: { username: user.username, role: user.role, notesCount: user.notesCount },
    });
    this.attachmentFilesService.deleteForUser(id);
    this.databaseService.connection.prepare('DELETE FROM users WHERE id = ?').run(id);

    return { id };
  }

  getStats(range?: string): AdminStatsResponse {
    return this.adminStatsService.getStats(range);
  }

  private getUserById(id: number): AdminUserResponse {
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT
            users.*,
            (
              SELECT COUNT(*)
              FROM notes
              WHERE notes.user_id = users.id
            ) AS notes_count,
            (
              SELECT us.plan_id
              FROM user_subscriptions us
              WHERE us.user_id = users.id
                AND us.status = 'active'
                AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
              ORDER BY us.id DESC
              LIMIT 1
            ) AS subscription_plan_id,
            (
              SELECT sp.name
              FROM user_subscriptions us
              INNER JOIN subscription_plans sp ON sp.id = us.plan_id
              WHERE us.user_id = users.id
                AND us.status = 'active'
                AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
              ORDER BY us.id DESC
              LIMIT 1
            ) AS subscription_plan_name,
            (
              SELECT sp.icon_key
              FROM user_subscriptions us
              INNER JOIN subscription_plans sp ON sp.id = us.plan_id
              WHERE us.user_id = users.id
                AND us.status = 'active'
                AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
              ORDER BY us.id DESC
              LIMIT 1
            ) AS subscription_plan_icon_key
          FROM users
          WHERE users.id = @id
        `,
      )
      .get({ id }) as AdminUserRecord | undefined;

    if (!row) {
      throw new NotFoundException(`User ${id} was not found`);
    }

    return this.mapUser(row);
  }

  private ensureUsernameAvailable(username: string): void {
    const row = this.databaseService.connection
      .prepare('SELECT id FROM users WHERE lower(username) = lower(@username)')
      .get({ username }) as { id: number } | undefined;

    if (row) {
      throw new ConflictException('Username is already used');
    }

    const pending = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM pending_registrations
          WHERE lower(username) = lower(@username)
            AND verified_at IS NULL
            AND expires_at > datetime('now')
          LIMIT 1
        `,
      )
      .get({ username }) as { id: number } | undefined;

    if (pending) {
      throw new ConflictException('Username is already used');
    }
  }

  private ensureEmailAvailable(email: string): void {
    const row = this.databaseService.connection
      .prepare('SELECT id FROM users WHERE lower(email) = lower(@email)')
      .get({ email }) as { id: number } | undefined;

    if (row) {
      throw new ConflictException('Email is already registered');
    }

    const pending = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM pending_registrations
          WHERE lower(email) = lower(@email)
            AND verified_at IS NULL
            AND expires_at > datetime('now')
          LIMIT 1
        `,
      )
      .get({ email }) as { id: number } | undefined;

    if (pending) {
      throw new ConflictException('Email is already registered');
    }
  }

  private countAdmins(): number {
    const row = this.databaseService.connection
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
      .get() as {
      count: number;
    };

    return row.count;
  }

  private mapUser(row: AdminUserRecord): AdminUserResponse {
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      language: row.language,
      theme: row.theme,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      notesCount: row.notes_count,
      subscriptionPlanId: row.subscription_plan_id ?? null,
      subscriptionPlanName: row.subscription_plan_name ?? null,
      subscriptionPlanIconKey: row.subscription_plan_icon_key ?? null,
    };
  }
}
