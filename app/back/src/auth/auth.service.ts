import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ActivityService } from '../activity/activity.service';
import { readPositiveInteger } from '../config/env';
import { DatabaseService } from '../infra/database.service';
import { verifyPassword } from './password';
import type { AuthUser, TokenPayload, UserLanguage, UserRecord, UserTheme } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto';

function toBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

const defaultTokenTtlSeconds = 60 * 60 * 24 * 14;
const defaultTokenSecret = 'dev-notes-change-this-secret';

@Injectable()
export class AuthService {
  private readonly tokenTtlSeconds: number;
  private readonly tokenSecret: string;

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(ConfigService) configService: ConfigService,
  ) {
    this.tokenTtlSeconds = readPositiveInteger(
      configService.get<string>('AUTH_TOKEN_TTL_SECONDS'),
      defaultTokenTtlSeconds,
    );
    this.tokenSecret = configService.get<string>('AUTH_SECRET')?.trim() || defaultTokenSecret;
  }

  login(dto: LoginDto): { token: string; user: AuthUser } {
    const user = this.databaseService.connection
      .prepare('SELECT * FROM users WHERE lower(username) = lower(?)')
      .get(dto.username.trim()) as UserRecord | undefined;

    if (!user || !verifyPassword(dto.password, user.password_hash)) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const authUser = this.mapUser(user);
    const now = new Date().toISOString();
    this.databaseService.connection
      .prepare('UPDATE users SET last_login_at = @lastLoginAt, updated_at = @lastLoginAt WHERE id = @id')
      .run({ id: authUser.id, lastLoginAt: now });
    this.activityService.record({
      actorId: authUser.id,
      userId: authUser.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: authUser.id,
    });

    return {
      token: this.signToken({ ...authUser, lastLoginAt: now }),
      user: { ...authUser, lastLoginAt: now },
    };
  }

  getUser(id: number): AuthUser {
    const user = this.databaseService.connection.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | UserRecord
      | undefined;

    if (!user) {
      throw new UnauthorizedException('User was not found');
    }

    return this.mapUser(user);
  }

  updatePreferences(userId: number, dto: UpdatePreferencesDto): AuthUser {
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

    return this.getUser(userId);
  }

  verifyToken(token: string): AuthUser {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid token');
    }

    const expectedSignature = this.sign(encodedPayload);
    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new UnauthorizedException('Invalid token');
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(fromBase64Url(encodedPayload)) as TokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!Number.isInteger(payload.sub) || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return this.getUser(payload.sub);
  }

  private signToken(user: AuthUser): string {
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + this.tokenTtlSeconds,
    };
    const encodedPayload = toBase64Url(JSON.stringify(payload));

    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.tokenSecret).update(encodedPayload).digest('base64url');
  }

  private mapUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      language: user.language,
      theme: user.theme,
      lastLoginAt: user.last_login_at,
    };
  }
}
