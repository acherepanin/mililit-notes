import { ApiError } from '../api';
import type { TranslationKey, Translator } from '../i18n';

// Сопоставление машинных кодов ошибок backend с короткими локализованными сообщениями.
export const API_ERROR_KEYS: Record<string, TranslationKey> = {
  // Подписка и лимиты тарифа
  SUBSCRIPTION_REQUIRED: 'errSubscriptionRequired',
  STORAGE_LIMIT_EXCEEDED: 'errStorageLimit',
  NOTE_LIMIT_EXCEEDED: 'errNoteLimit',
  NOTE_SIZE_LIMIT_EXCEEDED: 'errNoteSizeLimit',
  // Оформление подписки
  PLAN_INACTIVE: 'checkoutErrorPlanInactive',
  PLAN_NOT_PURCHASABLE: 'checkoutErrorPlanNotPurchasable',
  RENEW_REQUIRES_ACTIVE_PLAN: 'checkoutErrorRenewActive',
  INVALID_TERM: 'checkoutErrorInvalidTerm',
  ORDER_NOT_FOUND: 'checkoutErrorOrderNotFound',
  ORDER_NOT_PENDING: 'checkoutErrorOrderProcessed',
  CHECKOUT_DISABLED: 'checkoutErrorDisabled',
  // Аутентификация и профиль
  INVALID_CREDENTIALS: 'loginInvalidCredentials',
  EMAIL_NOT_CONFIRMED: 'loginNotConfirmed',
  CURRENT_PASSWORD_INVALID: 'errCurrentPasswordInvalid',
  PASSWORD_TOO_SHORT: 'errPasswordTooShort',
  USERNAME_INVALID: 'errUsernameInvalid',
  EMAIL_INVALID: 'errEmailInvalid',
  USERNAME_TAKEN: 'errUsernameTaken',
  EMAIL_TAKEN: 'errEmailTaken',
  VERIFY_LINK_INVALID: 'errVerifyLinkInvalid',
  VERIFY_LINK_EXPIRED: 'errVerifyLinkExpired',
  // ИИ
  AI_DISABLED: 'errAiDisabled',
  AI_MODEL_NOT_SELECTED: 'errAiModelNotSelected',
  AI_KEY_MISSING: 'errAiKeyMissing',
  AI_NOT_CONFIGURED: 'errAiNotConfigured',
  AI_EMPTY_RESPONSE: 'errAiEmptyResponse',
  AI_DAILY_REQUEST_LIMIT: 'errAiDailyRequestLimit',
  AI_DAILY_TOKEN_LIMIT: 'errAiDailyTokenLimit',
  AI_BASE_URL_INVALID: 'errAiBaseUrlInvalid',
  // Боты-мессенджеры
  BOT_LINK_INVALID: 'errBotLinkInvalid',
  BOT_ALREADY_LINKED: 'errBotAlreadyLinked',
  BOT_TOKEN_MISSING: 'errBotTokenMissing',
  // Вложения
  FILE_TOO_LARGE: 'errFileTooLarge',
  FILE_TYPE_NOT_ALLOWED: 'errFileTypeNotAllowed',
  ATTACHMENT_FILE_MISSING: 'errAttachmentMissing',
  NO_FILES_FOR_DOWNLOAD: 'errNoFilesForDownload',
  // Папки вложений
  FOLDER_NAME_TAKEN: 'errFolderNameTaken',
  FOLDER_SELF_MOVE: 'errFolderSelfMove',
  FOLDER_SUBFOLDER_MOVE: 'errFolderSubfolderMove',
  // Импорт заметок
  IMPORT_INVALID_JSON: 'errImportInvalidJson',
  IMPORT_TOO_MANY: 'errImportTooMany',
  IMPORT_INVALID_NOTE: 'errImportInvalidNote',
};

interface ResolveOptions {
  // Если код неизвестен, показать исходное сообщение сервера (полезно для
  // динамических ошибок провайдера ИИ: код статуса, текст провайдера и т.п.).
  preferServerMessage?: boolean;
}

// Возвращает короткое понятное сообщение: по коду ошибки — локализованное,
// иначе — сообщение сервера (если разрешено) или общий запасной текст.
export function resolveApiError(
  error: unknown,
  t: Translator,
  fallbackKey: TranslationKey,
  options: ResolveOptions = {},
): string {
  if (error instanceof ApiError) {
    const mapped = error.code ? API_ERROR_KEYS[error.code] : undefined;
    if (mapped) {
      return t(mapped);
    }
    if (options.preferServerMessage) {
      const message = error.message.trim();
      if (message) {
        return message;
      }
    }
  }
  return t(fallbackKey);
}

// Как resolveApiError, но с готовым запасным текстом вместо ключа перевода.
export function resolveApiErrorText(error: unknown, t: Translator, fallbackText: string): string {
  if (error instanceof ApiError && error.code && API_ERROR_KEYS[error.code]) {
    return t(API_ERROR_KEYS[error.code]);
  }
  return fallbackText;
}
