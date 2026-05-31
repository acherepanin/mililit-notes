import { ApiError } from '../api';
import type { Translator } from '../i18n';

export function resolveLoginErrorMessage(error: unknown, t: Translator): string {
  if (!(error instanceof ApiError)) {
    return t('loginError');
  }

  const message = error.message.trim();
  const normalized = message.toLowerCase();

  if (normalized.includes('not confirmed')) {
    return t('loginNotConfirmed');
  }
  if (normalized.includes('invalid username or password')) {
    return t('loginInvalidCredentials');
  }

  return message || t('loginError');
}
