import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { DatabaseService } from '../infra/database.service';
import { MailService } from '../mail/mail.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { hashPassword, verifyPassword } from './password';
import type { RegisterDto } from './dto/register.dto';
import {
  assertValidEmail,
  assertValidPassword,
  assertValidUsername,
  normalizeUsername,
} from './username.util';

const pendingTtlMs = 24 * 60 * 60 * 1000;

export type RegistrationPendingStatus = 'pending' | 'verified' | 'expired' | 'not_found';

export interface RegistrationPendingResponse {
  pendingId: number;
  email: string;
  expiresAt: string;
}

interface PendingRegistrationRecord {
  id: number;
  username: string;
  password_hash: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  token_hash: string;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

@Injectable()
export class RegistrationService implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(MailService) private readonly mailService: MailService,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.cleanupExpiredPending();
  }

  requestRegistration(dto: RegisterDto): RegistrationPendingResponse {
    this.cleanupExpiredPending();

    const username = normalizeUsername(dto.username);
    const email = dto.email.trim().toLowerCase();
    const password = dto.password;

    assertValidUsername(username);
    assertValidPassword(password);
    assertValidEmail(email);

    if (this.isUsernameReserved(username)) {
      throw new ConflictException('Username is already taken');
    }
    if (this.isEmailReserved(email)) {
      throw new ConflictException('Email is already registered');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const now = Date.now();
    const expiresAt = new Date(now + pendingTtlMs).toISOString();
    const createdAt = new Date(now).toISOString();

    const result = this.databaseService.connection
      .prepare(
        `
          INSERT INTO pending_registrations
            (username, password_hash, email, first_name, last_name, token_hash, expires_at, verified_at, created_at)
          VALUES
            (@username, @passwordHash, @email, @firstName, @lastName, @tokenHash, @expiresAt, NULL, @createdAt)
        `,
      )
      .run({
        username,
        passwordHash: hashPassword(password),
        email,
        firstName: dto.firstName?.trim() || null,
        lastName: dto.lastName?.trim() || null,
        tokenHash,
        expiresAt,
        createdAt,
      });

    const pendingId = Number(result.lastInsertRowid);
    const verifyUrl = this.buildVerifyUrl(token);
    void this.mailService.sendVerificationEmail(email, verifyUrl, 'ru');

    return { pendingId, email, expiresAt };
  }

  getPendingStatus(pendingId: number): { status: RegistrationPendingStatus } {
    this.cleanupExpiredPending();
    const row = this.databaseService.connection
      .prepare('SELECT * FROM pending_registrations WHERE id = @id')
      .get({ id: pendingId }) as PendingRegistrationRecord | undefined;

    if (!row) {
      return { status: 'not_found' };
    }
    if (row.verified_at) {
      return { status: 'verified' };
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      return { status: 'expired' };
    }
    return { status: 'pending' };
  }

  verifyEmail(token: string): { ok: true } {
    this.cleanupExpiredPending();
    const tokenHash = this.hashToken(token);
    const row = this.databaseService.connection
      .prepare('SELECT * FROM pending_registrations WHERE token_hash = @tokenHash')
      .get({ tokenHash }) as PendingRegistrationRecord | undefined;

    if (!row || row.verified_at) {
      throw new NotFoundException('Verification link is invalid or already used');
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      this.deletePending(row.id);
      throw new NotFoundException('Verification link has expired');
    }

    if (this.isUsernameReserved(row.username, row.id)) {
      this.deletePending(row.id);
      throw new ConflictException('Username is already taken');
    }
    if (this.isEmailReserved(row.email, row.id)) {
      this.deletePending(row.id);
      throw new ConflictException('Email is already registered');
    }

    const now = new Date().toISOString();
    const userResult = this.databaseService.connection
      .prepare(
        `
          INSERT INTO users
            (username, password_hash, role, language, theme, email, first_name, last_name, patronymic, birth_date, created_at, updated_at)
          VALUES
            (@username, @passwordHash, 'user', 'ru', 'dark', @email, @firstName, @lastName, NULL, NULL, @now, @now)
        `,
      )
      .run({
        username: row.username,
        passwordHash: row.password_hash,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        now,
      });

    const userId = Number(userResult.lastInsertRowid);
    this.subscriptionsService.ensureDefaultSubscription(userId);

    this.databaseService.connection
      .prepare(
        `
          UPDATE pending_registrations
          SET verified_at = @now, token_hash = @usedTokenHash
          WHERE id = @id
        `,
      )
      .run({
        id: row.id,
        now,
        usedTokenHash: `used:${row.id}:${tokenHash}`,
      });

    return { ok: true };
  }

  matchesPendingCredentials(username: string, password: string): boolean {
    this.cleanupExpiredPending();
    const normalized = normalizeUsername(username);
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT password_hash
          FROM pending_registrations
          WHERE lower(username) = @username
            AND verified_at IS NULL
            AND expires_at > datetime('now')
          LIMIT 1
        `,
      )
      .get({ username: normalized }) as { password_hash: string } | undefined;

    if (!row) {
      return false;
    }

    return verifyPassword(password, row.password_hash);
  }

  hasUnconfirmedRegistration(username: string): boolean {
    this.cleanupExpiredPending();
    const normalized = normalizeUsername(username);
    const row = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM pending_registrations
          WHERE lower(username) = @username
            AND verified_at IS NULL
            AND expires_at > datetime('now')
          LIMIT 1
        `,
      )
      .get({ username: normalized }) as { id: number } | undefined;
    return Boolean(row);
  }

  cleanupExpiredPending(): void {
    this.databaseService.connection
      .prepare(
        `
          DELETE FROM pending_registrations
          WHERE verified_at IS NULL AND expires_at <= datetime('now')
        `,
      )
      .run();
  }

  private isUsernameReserved(username: string, excludePendingId?: number): boolean {
    const existingUser = this.databaseService.connection
      .prepare('SELECT id FROM users WHERE lower(username) = lower(@username)')
      .get({ username }) as { id: number } | undefined;
    if (existingUser) {
      return true;
    }

    const pending = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM pending_registrations
          WHERE lower(username) = lower(@username)
            AND verified_at IS NULL
            AND expires_at > datetime('now')
            ${excludePendingId ? 'AND id != @excludePendingId' : ''}
          LIMIT 1
        `,
      )
      .get({ username, excludePendingId }) as { id: number } | undefined;

    return Boolean(pending);
  }

  private isEmailReserved(email: string, excludePendingId?: number): boolean {
    const existingUser = this.databaseService.connection
      .prepare('SELECT id FROM users WHERE lower(email) = lower(@email)')
      .get({ email }) as { id: number } | undefined;
    if (existingUser) {
      return true;
    }

    const pending = this.databaseService.connection
      .prepare(
        `
          SELECT id
          FROM pending_registrations
          WHERE lower(email) = lower(@email)
            AND verified_at IS NULL
            AND expires_at > datetime('now')
            ${excludePendingId ? 'AND id != @excludePendingId' : ''}
          LIMIT 1
        `,
      )
      .get({ email, excludePendingId }) as { id: number } | undefined;

    return Boolean(pending);
  }

  private deletePending(id: number): void {
    this.databaseService.connection
      .prepare('DELETE FROM pending_registrations WHERE id = @id')
      .run({ id });
  }

  private buildVerifyUrl(token: string): string {
    const baseUrl = this.configService.get<string>('APP_PUBLIC_URL')?.trim() || 'http://localhost:3000';
    return `${baseUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
