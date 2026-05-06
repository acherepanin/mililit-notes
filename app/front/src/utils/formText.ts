import type { Translator } from '../i18n';

export function savedHintPlaceholder(
  t: Translator,
  hint: string | null | undefined,
  fallback: string,
): string {
  return hint ? `${t('saved')}: ${hint}` : fallback;
}
