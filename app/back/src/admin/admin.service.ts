import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ActivityService } from '../activity/activity.service';
import type { ActivityResponse } from '../activity/activity.types';
import { hashPassword } from '../auth/password';
import { AttachmentFilesService } from '../infra/attachment-files.service';
import { DatabaseService } from '../infra/database.service';
import { AdminStatsService } from './admin-stats.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { AdminStatsResponse, AdminUserRecord, AdminUserResponse } from './admin.types';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AttachmentFilesService)
    private readonly attachmentFilesService: AttachmentFilesService,
    @Inject(AdminStatsService) private readonly adminStatsService: AdminStatsService,
  ) {}

  listUsers(): AdminUserResponse[] {
    const rows = this.databaseService.connection
      .prepare(
        `
          SELECT users.*, COUNT(notes.id) as notes_count
          FROM users
          LEFT JOIN notes ON notes.user_id = users.id
          GROUP BY users.id
          ORDER BY lower(users.username) ASC
        `,
      )
      .all() as AdminUserRecord[];

    return rows.map((row) => this.mapUser(row));
  }

  createUser(actorId: number, dto: CreateUserDto): AdminUserResponse {
    const username = this.normalizeUsername(dto.username);
    this.ensureUsernameAvailable(username);
    const now = new Date().toISOString();
    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, language, theme, created_at, updated_at)
          VALUES (@username, @passwordHash, @role, @language, @theme, @now, @now)
        `,
      )
      .run({
        username,
        passwordHash: hashPassword(dto.password),
        role: dto.role ?? 'user',
        language: dto.language ?? 'ru',
        theme: dto.theme ?? 'dark',
        now,
      });
    const user = this.getUserById(Number(result.lastInsertRowid));
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

  listActivity(limit?: number): ActivityResponse[] {
    return this.activityService.list(limit);
  }

  getStats(range?: string): AdminStatsResponse {
    return this.adminStatsService.getStats(range);
  }

  private getUserById(id: number): AdminUserResponse {
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT users.*, COUNT(notes.id) as notes_count
          FROM users
          LEFT JOIN notes ON notes.user_id = users.id
          WHERE users.id = @id
          GROUP BY users.id
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
  }

  private normalizeUsername(username: string): string {
    const normalized = username.trim();

    if (normalized.length === 0) {
      throw new BadRequestException('Username cannot be empty');
    }

    return normalized;
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
    };
  }
}
