import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ActivityService } from '../activity/activity.service';
import { readPositiveInteger } from '../config/env';
import { DatabaseService } from '../infra/database.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { MeSubscriptionBundle } from '../subscriptions/subscriptions.types';
import {
  assertValidPassword,
  normalizeUsername,
} from './username.util';
import { RegistrationService } from './registration.service';
import { hashPassword, verifyPassword } from './password';
import {
  USER_THEME_VALUES,
  type AuthUser,
  type MeResponse,
  type TokenPayload,
  type UserLanguage,
  type UserRecord,
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
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
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
    if (nodeEnv === 'production' && (!configuredSecret || configuredSecret === defaultTokenSecret)) {
      throw new Error('AUTH_SECRET must be set to a strong unique value in production');
    }
    this.tokenSecret = configuredSecret || defaultTokenSecret;
  }

  login(dto: LoginDto): { token: string; user: MeResponse } {
    const username = normalizeUsername(dto.username);
    const user = this.findUserRecordByUsername(username);

    if (user) {
      if (!verifyPassword(dto.password, user.password_hash)) {
        throw new UnauthorizedException('Invalid username or password');
      }
    } else if (this.registrationService.matchesPendingCredentials(username, dto.password)) {
      throw new UnauthorizedException('Account email is not confirmed yet');
    } else {
      throw new UnauthorizedException('Invalid username or password');
    }

    const authUser = this.mapUser(user!);
    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare(
        'UPDATE users SET last_login_at = @lastLoginAt, updated_at = @lastLoginAt WHERE id = @id',
      )
      .run({ id: authUser.id, lastLoginAt: now });
    this.activityService.record({
      actorId: authUser.id,
      userId: authUser.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: authUser.id,
    });

    const me = this.buildMeResponse({ ...authUser, lastLoginAt: now }, user!);
    return {
      token: this.signToken(me),
      user: me,
    };
  }

  getMe(userId: number): MeResponse & { subscription: MeSubscriptionBundle } {
    const user = this.getUserRecord(userId);
    const authUser = this.mapUser(user);
    const bundle = this.subscriptionsService.getMeSubscriptionBundle(userId);
    return {
      ...this.buildMeResponse(authUser, user),
      subscription: {
        ...bundle,
        entitlements: this.entitlementsService.getEffectiveEntitlements(userId),
      },
    };
  }

  getUser(id: number): AuthUser {
    return this.mapUser(this.getUserRecord(id));
  }

  updatePreferences(userId: number, dto: UpdatePreferencesDto): MeResponse & {
    subscription: MeSubscriptionBundle;
  } {
    const user = this.getUser(userId);
    const language: UserLanguage = dto.language ?? user.language;
    const theme: UserTheme = dto.theme ?? user.theme;

    this.databaseService.connection
      .prepare(
        `
          UPDATE users
          SET language = @language, theme = @theme, updated_at = @updatedAt
          WHERE id = @id
        `,
      )
      .run({
        id: userId,
        language,
        theme,
        updatedAt: new Date().toISOString(),
      });

    return this.getMe(userId);
  }

  updateProfile(userId: number, dto: UpdateProfileDto): MeResponse & { subscription: MeSubscriptionBundle } {
    const fields: string[] = [];
    const params: Record<string, string | number | null> = { id: userId, updatedAt: new Date().toISOString() };
    if (dto.firstName !== undefined) {
      fields.push('first_name = @firstName');
      params.firstName = dto.firstName?.trim() || null;
    }
    if (dto.lastName !== undefined) {
      fields.push('last_name = @lastName');
      params.lastName = dto.lastName?.trim() || null;
    }
    if (dto.patronymic !== undefined) {
      fields.push('patronymic = @patronymic');
      params.patronymic = dto.patronymic?.trim() || null;
    }
    if (dto.birthDate !== undefined) {
      fields.push('birth_date = @birthDate');
      params.birthDate = dto.birthDate?.trim() || null;
    }
    if (fields.length > 0) {
      this.databaseService.connection
        .prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = @updatedAt WHERE id = @id`)
        .run(params);
    }

    return this.getMe(userId);
  }

  changePassword(userId: number, dto: ChangePasswordDto): { ok: true } {
    const user = this.getUserRecord(userId);
    if (!verifyPassword(dto.currentPassword, user.password_hash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    assertValidPassword(dto.newPassword);
    this.databaseService.connection
      .prepare('UPDATE users SET password_hash = @passwordHash, updated_at = @updatedAt WHERE id = @id')
      .run({
        id: userId,
        passwordHash: hashPassword(dto.newPassword),
        updatedAt: new Date().toISOString(),
      });
    return { ok: true };
  }

  verifyToken(token: string): AuthUser {
    const payload = readSignedToken(token, this.tokenSecret);

    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return this.getUser(payload.sub);
  }

  private findUserRecordByUsername(username: string): UserRecord | undefined {
    return this.databaseService.connection
      .prepare('SELECT * FROM users WHERE lower(username) = lower(?)')
      .get(username) as UserRecord | undefined;
  }

  private getUserRecord(id: number): UserRecord {
    const user = this.databaseService.connection
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRecord | undefined;
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

  private buildMeResponse(authUser: AuthUser, record: UserRecord): MeResponse {
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

  private mapUser(user: UserRecord): AuthUser {
    const theme = USER_THEME_VALUES.includes(user.theme as UserTheme)
      ? (user.theme as UserTheme)
      : 'dark';

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      language: user.language,
      theme,
      lastLoginAt: user.last_login_at,
    };
  }
}
