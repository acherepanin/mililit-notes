import { createHmac, timingSafeEqual } from 'node:crypto';

import { isRecord } from '../utils/type-guards';
import type { TokenPayload } from './auth.types';

function toBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Number.isInteger(value.sub) &&
    typeof value.username === 'string' &&
    (value.role === 'user' || value.role === 'admin') &&
    typeof value.exp === 'number'
  );
}

// Сравнение подписей за постоянное время — защита от timing-атак.
function signaturesMatch(receivedSignature: string, expectedSignature: string): boolean {
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Лёгкий токен формата `payload.signature` (HMAC-SHA256), без внешних JWT-библиотек.
export function createSignedToken(payload: TokenPayload, secret: string): string {
  const encodedPayload = toBase64Url(JSON.stringify(payload));

  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function readSignedToken(token: string, secret: string): TokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  if (!signaturesMatch(signature, signPayload(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(fromBase64Url(encodedPayload));

    return isTokenPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}
