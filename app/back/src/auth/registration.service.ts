import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';

import { PendingRegistrationEntity } from '../database/entities/registration.entity';
import { UserEntity } from '../database/entities/user.entity';
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

@Injectable()
export class RegistrationService implements OnModuleInit {
  constructor(
    @InjectRepository(PendingRegistrationEntity)
    private readonly pendingRepo: Repository<PendingRegistrationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @Inject(MailService) private readonly mailService: MailService,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.cleanupExpiredPending();
  }

  async requestRegistration(dto: RegisterDto): Promise<RegistrationPendingResponse> {
    await this.cleanupExpiredPending();

    const username = normalizeUsername(dto.username);
    const email = dto.email.trim().toLowerCase();
    const password = dto.password;

    assertValidUsername(username);
    assertValidPassword(password);
    assertValidEmail(email);

    if (await this.isUsernameReserved(username)) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Username is already taken',
        code: 'USERNAME_TAKEN',
      });
    }
    if (await this.isEmailReserved(email)) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Email is already registered',
        code: 'EMAIL_TAKEN',
      });
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const now = Date.now();
    const expiresAt = new Date(now + pendingTtlMs).toISOString();
    const createdAt = new Date(now).toISOString();

    const pending = await this.pendingRepo.save(
      this.pendingRepo.create({
        username,
        password_hash: hashPassword(password),
        email,
        first_name: dto.firstName?.trim() || null,
        last_name: dto.lastName?.trim() || null,
        token_hash: tokenHash,
        expires_at: expiresAt,
        verified_at: null,
        created_at: createdAt,
      }),
    );

    const verifyUrl = this.buildVerifyUrl(token);
    void this.mailService.sendVerificationEmail(email, verifyUrl, 'ru');

    return { pendingId: pending.id, email, expiresAt };
  }

  async getPendingStatus(pendingId: number): Promise<{ status: RegistrationPendingStatus }> {
    await this.cleanupExpiredPending();
    const row = await this.pendingRepo.findOne({ where: { id: pendingId } });

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

  async verifyEmail(token: string): Promise<{ ok: true }> {
    await this.cleanupExpiredPending();
    const tokenHash = this.hashToken(token);
    const row = await this.pendingRepo.findOne({ where: { token_hash: tokenHash } });

    if (!row || row.verified_at) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Verification link is invalid or already used',
        code: 'VERIFY_LINK_INVALID',
      });
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      await this.deletePending(row.id);
      throw new NotFoundException({
        statusCode: 404,
        message: 'Verification link has expired',
        code: 'VERIFY_LINK_EXPIRED',
      });
    }

    if (await this.isUsernameReserved(row.username, row.id)) {
      await this.deletePending(row.id);
      throw new ConflictException({
        statusCode: 409,
        message: 'Username is already taken',
        code: 'USERNAME_TAKEN',
      });
    }
    if (await this.isEmailReserved(row.email, row.id)) {
      await this.deletePending(row.id);
      throw new ConflictException({
        statusCode: 409,
        message: 'Email is already registered',
        code: 'EMAIL_TAKEN',
      });
    }

    const now = new Date().toISOString();
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        username: row.username,
        password_hash: row.password_hash,
        role: 'user',
        language: 'ru',
        theme: 'dark',
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        patronymic: null,
        birth_date: null,
        created_at: now,
        updated_at: now,
      }),
    );

    await this.subscriptionsService.ensureDefaultSubscription(user.id);

    await this.pendingRepo.update(row.id, {
      verified_at: now,
      token_hash: `used:${row.id}:${tokenHash}`,
    });

    return { ok: true };
  }

  async matchesPendingCredentials(username: string, password: string): Promise<boolean> {
    await this.cleanupExpiredPending();
    const normalized = normalizeUsername(username);
    const row = await this.pendingRepo
      .createQueryBuilder('p')
      .select('p.password_hash', 'password_hash')
      .where('lower(p.username) = :username', { username: normalized })
      .andWhere('p.verified_at IS NULL')
      .andWhere('p.expires_at > :now', { now: new Date().toISOString() })
      .limit(1)
      .getRawOne<{ password_hash: string }>();

    if (!row) {
      return false;
    }

    return verifyPassword(password, row.password_hash);
  }

  async hasUnconfirmedRegistration(username: string): Promise<boolean> {
    await this.cleanupExpiredPending();
    const normalized = normalizeUsername(username);
    const count = await this.pendingRepo
      .createQueryBuilder('p')
      .where('lower(p.username) = :username', { username: normalized })
      .andWhere('p.verified_at IS NULL')
      .andWhere('p.expires_at > :now', { now: new Date().toISOString() })
      .getCount();
    return count > 0;
  }

  async cleanupExpiredPending(): Promise<void> {
    await this.pendingRepo
      .createQueryBuilder()
      .delete()
      .where('verified_at IS NULL')
      .andWhere('expires_at <= :now', { now: new Date().toISOString() })
      .execute();
  }

  private async isUsernameReserved(username: string, excludePendingId?: number): Promise<boolean> {
    const existingUser = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.username) = lower(:username)', { username })
      .getCount();
    if (existingUser > 0) {
      return true;
    }

    const pending = this.pendingRepo
      .createQueryBuilder('p')
      .where('lower(p.username) = lower(:username)', { username })
      .andWhere('p.verified_at IS NULL')
      .andWhere('p.expires_at > :now', { now: new Date().toISOString() });
    if (excludePendingId) {
      pending.andWhere('p.id != :excludePendingId', { excludePendingId });
    }

    return (await pending.getCount()) > 0;
  }

  private async isEmailReserved(email: string, excludePendingId?: number): Promise<boolean> {
    const existingUser = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email })
      .getCount();
    if (existingUser > 0) {
      return true;
    }

    const pending = this.pendingRepo
      .createQueryBuilder('p')
      .where('lower(p.email) = lower(:email)', { email })
      .andWhere('p.verified_at IS NULL')
      .andWhere('p.expires_at > :now', { now: new Date().toISOString() });
    if (excludePendingId) {
      pending.andWhere('p.id != :excludePendingId', { excludePendingId });
    }

    return (await pending.getCount()) > 0;
  }

  private async deletePending(id: number): Promise<void> {
    await this.pendingRepo.delete({ id });
  }

  private buildVerifyUrl(token: string): string {
    const baseUrl =
      this.configService.get<string>('APP_PUBLIC_URL')?.trim() || 'http://localhost:3000';
    return `${baseUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
