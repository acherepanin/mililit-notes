import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const encryptedPrefix = 'enc:v1:';
const secretKindPattern = /\bdata-kind=(["'])(?:password|credential|token)\1/i;

@Injectable()
export class SecretFieldCryptoService {
  private readonly key: Buffer | null;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const rawKey = configService.get<string>('SECRET_ENCRYPTION_KEY')?.trim();
    this.key = rawKey ? createHash('sha256').update(rawKey).digest() : null;
  }

  encryptNoteHtml(contentHtml: string): string {
    if (!this.key || !contentHtml.includes('data-copy-field')) {
      return contentHtml;
    }

    return contentHtml.replace(
      /(<div\b(?=[^>]*data-copy-field)[^>]*?)\sdata-value="([^"]*)"([^>]*>)/g,
      (match: string, before: string, value: string, after: string) => {
        const tag = `${before}${after}`;
        const isSecret = secretKindPattern.test(tag) || value.startsWith(encryptedPrefix);

        if (!isSecret || value.startsWith(encryptedPrefix)) {
          return match;
        }

        return `${before} data-value="${this.encryptValue(value)}"${after}`;
      },
    );
  }

  decryptNoteHtml(contentHtml: string): string {
    if (!this.key || !contentHtml.includes(encryptedPrefix)) {
      return contentHtml;
    }

    return contentHtml.replace(
      /\bdata-value="(enc:v1:[^"]*)"/g,
      (_match: string, value: string) => {
        return `data-value="${this.decryptValue(value)}"`;
      },
    );
  }

  private encryptValue(value: string): string {
    if (!this.key) {
      return value;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${encryptedPrefix}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
  }

  private decryptValue(value: string): string {
    if (!this.key || !value.startsWith(encryptedPrefix)) {
      return value;
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
      return '';
    }
  }
}
