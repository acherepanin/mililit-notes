import type { MonitoringRange } from './monitoring.types';

const EXACT_IGNORED_PATHS = new Set(['/api/health']);

const PREFIX_IGNORED_PATHS = [
  '/api/auth/register/pending/',
  '/api/auth/login',
  '/api/auth/register',
  '/api/ai/bots/',
  '/api/admin/monitoring/',
];

const READ_IGNORED_PATHS = new Set([
  '/api/notes/tree',
  '/api/subscription/me',
  '/api/admin/stats',
]);

const SENSITIVE_KEY_PATTERN =
  /^(password|passwd|pass|token|secret|apikey|authorization|cookie|creditcard|cvv|ssn)$/i;

export function normalizeRequestPath(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath;
  const normalized = withoutQuery.startsWith('/api')
    ? withoutQuery
    : `/api${withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`}`;

  return normalized.replace(/\/+$/, '') || '/api';
}

export function shouldIgnoreRequestMetrics(method: string, path: string): boolean {
  const normalizedPath = normalizeRequestPath(path);
  const upperMethod = method.toUpperCase();

  if (EXACT_IGNORED_PATHS.has(normalizedPath)) {
    return true;
  }

  if (PREFIX_IGNORED_PATHS.some((prefix) => normalizedPath.startsWith(prefix))) {
    return true;
  }

  if (upperMethod === 'GET' && READ_IGNORED_PATHS.has(normalizedPath)) {
    return true;
  }

  return false;
}

export function shouldPersistRequestError(statusCode: number, method: string, path: string): boolean {
  if (statusCode < 400) {
    return false;
  }

  if (statusCode === 401 || statusCode === 404) {
    return false;
  }

  if (shouldIgnoreRequestMetrics(method, path)) {
    return false;
  }

  return true;
}

export function normalizeMonitoringLimit(limit?: number, fallback = 100): number {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(limit as number), 1), 200);
}

export function rangeToMs(range: MonitoringRange): number {
  switch (range) {
    case 'hour':
      return 60 * 60 * 1000;
    case 'day':
      return 24 * 60 * 60 * 1000;
    case 'week':
      return 7 * 24 * 60 * 60 * 1000;
    case 'month':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = normalizeSensitiveKey(key);
      if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) {
        result[key] = '[redacted]';
        continue;
      }

      result[key] = redactSensitiveValue(nestedValue);
    }

    return result;
  }

  return value;
}

export function sanitizeErrorBody(body: unknown): Record<string, unknown> | null {
  if (body === undefined || body === null) {
    return null;
  }

  if (typeof body === 'string') {
    return { message: body.slice(0, 2000) };
  }

  if (typeof body === 'object') {
    try {
      const redacted = redactSensitiveValue(body);
      const serialized = JSON.stringify(redacted);
      if (serialized.length > 4000) {
        return { truncated: true, preview: serialized.slice(0, 4000) };
      }

      return redacted as Record<string, unknown>;
    } catch {
      return { message: String(body).slice(0, 2000) };
    }
  }

  return { message: String(body).slice(0, 2000) };
}
