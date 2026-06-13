import type { Translator } from '../i18n';
import { resolveApiError } from './apiErrors';

export function resolveLoginErrorMessage(error: unknown, t: Translator): string {
  return resolveApiError(error, t, 'loginError');
}
