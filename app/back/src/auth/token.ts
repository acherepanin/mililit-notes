import { createHmac, timingSafeEqual } from 'node:crypto';

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
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<TokenPayload>;

  return (
    Number.isInteger(payload.sub) &&
    typeof payload.username === 'string' &&
    (payload.role === 'user' || payload.role === 'admin') &&
    typeof payload.exp === 'number'
  );
}

function signaturesMatch(receivedSignature: string, expectedSignature: string): boolean {
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

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
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as unknown;

    return isTokenPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}
