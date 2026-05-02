import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const keyLength = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, keyLength).toString('hex');

  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hash] = storedHash.split(':');

  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const candidate = Buffer.from(scryptSync(password, salt, keyLength).toString('hex'), 'hex');
  const expected = Buffer.from(hash, 'hex');

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
