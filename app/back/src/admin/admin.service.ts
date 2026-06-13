import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { hashPassword } from '../auth/password';
import {
  assertValidEmail,
  assertValidPassword,
  assertValidUsername,
  normalizeUsername,
} from '../auth/username.util';
import { nowIso } from '../database/db.util';
import { PendingRegistrationEntity } from '../database/entities/registration.entity';
import { UserEntity } from '../database/entities/user.entity';
import { AttachmentFilesService } from '../infra/attachment-files.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AdminStatsService } from './admin-stats.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { AdminStatsResponse, AdminUserRecord, AdminUserResponse } from './admin.types';

/**
 * Single-query projection of a user joined with their active subscription plan
 * (id, name, icon) and note count. `$1` binds the "now" timestamp; an optional
 * extra predicate (`$2`) narrows to one user.
 */
const ACTIVE_SUB = (alias: string) =>
  `us.user_id = ${alias}.id AND us.status = 'active' AND (us.expires_at IS NULL OR us.expires_at > $1)`;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(PendingRegistrationEntity)
    private readonly pendingRepo: Repository<PendingRegistrationEntity>,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AttachmentFilesService)
    private readonly attachmentFilesService: AttachmentFilesService,
    @Inject(AdminStatsService) private readonly adminStatsService: AdminStatsService,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async listUsers(): Promise<AdminUserResponse[]> {
    const rows = (await this.usersRepo.query(
      `${this.userSelectSql()} ORDER BY lower(users.username) ASC`,
      [nowIso()],
    )) as AdminUserRecord[];
    return rows.map((row) => this.mapUser(row));
  }

  async createUser(actorId: number, dto: CreateUserDto): Promise<AdminUserResponse> {
    const username = normalizeUsername(dto.username);
    const email = dto.email.trim().toLowerCase();
    assertValidUsername(username);
    assertValidPassword(dto.password);
    assertValidEmail(email);
    await this.ensureUsernameAvailable(username);
    await this.ensureEmailAvailable(email);

    const now = nowIso();
    const created = await this.usersRepo.save(
      this.usersRepo.create({
        username,
        password_hash: hashPassword(dto.password),
        role: dto.role ?? 'user',
        language: dto.language ?? 'ru',
        theme: dto.theme ?? 'dark',
        email,
        created_at: now,
        updated_at: now,
      }),
    );
    await this.subscriptionsService.ensureDefaultSubscription(created.id);
    const user = await this.getUserById(created.id);
    await this.activityService.record({
      actorId,
      userId: user.id,
      action: 'admin.user.create',
      targetType: 'user',
      targetId: user.id,
      details: { username: user.username, role: user.role },
    });

    return user;
  }

  async updateUser(actorId: number, id: number, dto: UpdateUserDto): Promise<AdminUserResponse> {
    const existingUser = await this.getUserById(id);
    if (dto.role === 'user' && existingUser.role === 'admin' && (await this.countAdmins()) <= 1) {
      throw new BadRequestException('At least one admin is required');
    }

    const patch: Partial<UserEntity> = { updated_at: nowIso() };
    if (dto.password !== undefined) {
      patch.password_hash = hashPassword(dto.password);
    }
    if (dto.role !== undefined) {
      patch.role = dto.role;
    }

    await this.usersRepo.update(id, patch);
    const user = await this.getUserById(id);
    await this.activityService.record({
      actorId,
      userId: user.id,
      action: 'admin.user.update',
      targetType: 'user',
      targetId: user.id,
      details: { username: user.username, role: user.role },
    });

    return user;
  }

  async deleteUser(actorId: number, id: number): Promise<{ id: number }> {
    if (actorId === id) {
      throw new BadRequestException('Admin cannot delete own account');
    }

    const user = await this.getUserById(id);
    await this.activityService.record({
      actorId,
      userId: id,
      action: 'admin.user.delete',
      targetType: 'user',
      targetId: id,
      details: { username: user.username, role: user.role, notesCount: user.notesCount },
    });
    await this.attachmentFilesService.deleteForUser(id);
    await this.usersRepo.delete({ id });

    return { id };
  }

  getStats(range?: string): Promise<AdminStatsResponse> {
    return this.adminStatsService.getStats(range);
  }

  private async getUserById(id: number): Promise<AdminUserResponse> {
    const rows = (await this.usersRepo.query(`${this.userSelectSql()} WHERE users.id = $2`, [
      nowIso(),
      id,
    ])) as AdminUserRecord[];
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`User ${id} was not found`);
    }
    return this.mapUser(row);
  }

  private userSelectSql(): string {
    return `
      SELECT
        users.*,
        (SELECT COUNT(*) FROM notes WHERE notes.user_id = users.id)::int AS notes_count,
        (SELECT us.plan_id FROM user_subscriptions us
          WHERE ${ACTIVE_SUB('users')} ORDER BY us.id DESC LIMIT 1) AS subscription_plan_id,
        (SELECT sp.name FROM user_subscriptions us
          INNER JOIN subscription_plans sp ON sp.id = us.plan_id
          WHERE ${ACTIVE_SUB('users')} ORDER BY us.id DESC LIMIT 1) AS subscription_plan_name,
        (SELECT sp.icon_key FROM user_subscriptions us
          INNER JOIN subscription_plans sp ON sp.id = us.plan_id
          WHERE ${ACTIVE_SUB('users')} ORDER BY us.id DESC LIMIT 1) AS subscription_plan_icon_key
      FROM users
    `;
  }

  private async ensureUsernameAvailable(username: string): Promise<void> {
    const userExists = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.username) = lower(:username)', { username })
      .getExists();
    if (userExists) {
      throw new ConflictException('Username is already used');
    }

    const pendingExists = await this.pendingRepo
      .createQueryBuilder('p')
      .where('lower(p.username) = lower(:username)', { username })
      .andWhere('p.verified_at IS NULL')
      .andWhere('p.expires_at > :now', { now: nowIso() })
      .getExists();
    if (pendingExists) {
      throw new ConflictException('Username is already used');
    }
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    const userExists = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email })
      .getExists();
    if (userExists) {
      throw new ConflictException('Email is already registered');
    }

    const pendingExists = await this.pendingRepo
      .createQueryBuilder('p')
      .where('lower(p.email) = lower(:email)', { email })
      .andWhere('p.verified_at IS NULL')
      .andWhere('p.expires_at > :now', { now: nowIso() })
      .getExists();
    if (pendingExists) {
      throw new ConflictException('Email is already registered');
    }
  }

  private async countAdmins(): Promise<number> {
    return this.usersRepo.count({ where: { role: 'admin' } });
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
