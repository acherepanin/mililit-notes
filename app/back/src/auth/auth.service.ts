import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { readPositiveInteger } from '../config/env';
import { UserEntity } from '../database/entities/user.entity';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { MeSubscriptionBundle } from '../subscriptions/subscriptions.types';
import { assertValidPassword, normalizeUsername } from './username.util';
import { RegistrationService } from './registration.service';
import { hashPassword, verifyPassword } from './password';
import {
  USER_THEME_VALUES,
  type AuthUser,
  type MeResponse,
  type TokenPayload,
  type UserLanguage,
  type UserRole,
  type UserTheme,
} from './auth.types';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { createSignedToken, readSignedToken } from './token';

const defaultTokenTtlSeconds = 60 * 60 * 24 * 14;
const defaultTokenSecret = 'dev-notes-change-this-secret';

@Injectable()
export class AuthService {
  private readonly tokenTtlSeconds: number;
  private readonly tokenSecret: string;

  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService,
    @Inject(EntitlementsService) private readonly entitlementsService: EntitlementsService,
    @Inject(RegistrationService) private readonly registrationService: RegistrationService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.tokenTtlSeconds = readPositiveInteger(
      configService.get<string>('AUTH_TOKEN_TTL_SECONDS'),
      defaultTokenTtlSeconds,
    );
    const configuredSecret = configService.get<string>('AUTH_SECRET')?.trim();
    const nodeEnv = configService.get<string>('NODE_ENV')?.trim() || 'development';
    if (
      nodeEnv === 'production' &&
      (!configuredSecret || configuredSecret === defaultTokenSecret)
    ) {
      throw new Error('AUTH_SECRET must be set to a strong unique value in production');
    }
    this.tokenSecret = configuredSecret || defaultTokenSecret;
  }

  async login(dto: LoginDto): Promise<{ token: string; user: MeResponse }> {
    const username = normalizeUsername(dto.username);
    const user = await this.findUserRecordByUsername(username);

    if (user) {
      if (!verifyPassword(dto.password, user.password_hash)) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid username or password',
          code: 'INVALID_CREDENTIALS',
        });
      }
    } else if (await this.registrationService.matchesPendingCredentials(username, dto.password)) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Account email is not confirmed yet',
        code: 'EMAIL_NOT_CONFIRMED',
      });
    } else {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const authUser = this.mapUser(user!);
    const now = new Date().toISOString();
    await this.usersRepo.update(authUser.id, { last_login_at: now, updated_at: now });
    await this.activityService.record({
      actorId: authUser.id,
      userId: authUser.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: authUser.id,
    });

    const me = await this.buildMeResponse({ ...authUser, lastLoginAt: now }, user!);
    return {
      token: this.signToken(me),
      user: me,
    };
  }

  async getMe(userId: number): Promise<MeResponse & { subscription: MeSubscriptionBundle }> {
    const user = await this.getUserRecord(userId);
    const authUser = this.mapUser(user);
    const bundle = await this.subscriptionsService.getMeSubscriptionBundle(userId);
    return {
      ...this.buildMeResponse(authUser, user),
      subscription: {
        ...bundle,
        entitlements: await this.entitlementsService.getEffectiveEntitlements(userId),
      },
    };
  }

  async getUser(id: number): Promise<AuthUser> {
    return this.mapUser(await this.getUserRecord(id));
  }

  async updatePreferences(
    userId: number,
    dto: UpdatePreferencesDto,
  ): Promise<MeResponse & { subscription: MeSubscriptionBundle }> {
    const user = await this.getUser(userId);
    const language: UserLanguage = dto.language ?? user.language;
    const theme: UserTheme = dto.theme ?? user.theme;

    await this.usersRepo.update(userId, {
      language,
      theme,
      updated_at: new Date().toISOString(),
    });

    return this.getMe(userId);
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<MeResponse & { subscription: MeSubscriptionBundle }> {
    const patch: Partial<UserEntity> = {};
    if (dto.firstName !== undefined) {
      patch.first_name = dto.firstName?.trim() || null;
    }
    if (dto.lastName !== undefined) {
      patch.last_name = dto.lastName?.trim() || null;
    }
    if (dto.patronymic !== undefined) {
      patch.patronymic = dto.patronymic?.trim() || null;
    }
    if (dto.birthDate !== undefined) {
      patch.birth_date = dto.birthDate?.trim() || null;
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await this.usersRepo.update(userId, patch);
    }

    return this.getMe(userId);
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.getUserRecord(userId);
    if (!verifyPassword(dto.currentPassword, user.password_hash)) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Current password is incorrect',
        code: 'CURRENT_PASSWORD_INVALID',
      });
    }
    assertValidPassword(dto.newPassword);
    await this.usersRepo.update(userId, {
      password_hash: hashPassword(dto.newPassword),
      updated_at: new Date().toISOString(),
    });
    return { ok: true };
  }

  async verifyToken(token: string): Promise<AuthUser> {
    const payload = readSignedToken(token, this.tokenSecret);

    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return this.getUser(payload.sub);
  }

  private async findUserRecordByUsername(username: string): Promise<UserEntity | undefined> {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.username) = lower(:username)', { username })
      .getOne();
    return user ?? undefined;
  }

  private async getUserRecord(id: number): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new UnauthorizedException('User was not found');
    }
    return user;
  }

  private signToken(user: AuthUser): string {
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + this.tokenTtlSeconds,
    };
    return createSignedToken(payload, this.tokenSecret);
  }

  private buildMeResponse(authUser: AuthUser, record: UserEntity): MeResponse {
    return {
      ...authUser,
      profile: {
        email: record.email,
        firstName: record.first_name,
        lastName: record.last_name,
        patronymic: record.patronymic,
        birthDate: record.birth_date,
      },
    };
  }

  private mapUser(user: UserEntity): AuthUser {
    const theme = USER_THEME_VALUES.includes(user.theme as UserTheme)
      ? (user.theme as UserTheme)
      : 'dark';

    return {
      id: user.id,
      username: user.username,
      role: user.role as UserRole,
      language: user.language as UserLanguage,
      theme,
      lastLoginAt: user.last_login_at,
    };
  }
}
