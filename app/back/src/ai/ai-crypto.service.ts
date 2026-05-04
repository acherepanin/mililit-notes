import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const encryptedPrefix = 'ai:v1:';

@Injectable()
export class AiCryptoService {
  private readonly key: Buffer | null;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const rawKey = configService.get<string>('AI_CREDENTIALS_ENCRYPTION_KEY')?.trim();
    this.key = rawKey ? createHash('sha256').update(rawKey).digest() : null;
  }

  encrypt(value: string): string {
    if (!this.key) {
      throw new BadRequestException('AI credentials encryption key is not configured');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${encryptedPrefix}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
  }

  decrypt(value: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!this.key || !value.startsWith(encryptedPrefix)) {
      return null;
    }

    try {
      const payload = Buffer.from(value.slice(encryptedPrefix.length), 'base64url');
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  createHint(value: string): string {
    const trimmed = value.trim();

    if (trimmed.length <= 8) {
      return '********';
    }

    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }
}
