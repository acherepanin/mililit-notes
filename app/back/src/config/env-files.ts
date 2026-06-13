/**
 * Возвращает упорядоченный список env-файлов для @nestjs/config.
 *
 * Слои: файл окружения (.env.dev / .env.prod) переопределяет базовый `.env`.
 * @nestjs/config отдаёт приоритет ПЕРВОМУ файлу в массиве, поэтому файл
 * окружения идёт первым. Реальные переменные процесса/контейнера всегда
 * важнее значений из файлов.
 *
 * Активное окружение выбирается через APP_ENV (передаётся npm-скриптами,
 * напр. `cross-env APP_ENV=prod`). По умолчанию `dev`.
 */
export function resolveEnvFilePaths(): string[] {
  const appEnv = (process.env.APP_ENV ?? 'dev').trim() || 'dev';
  return [`.env.${appEnv}`, '.env'];
}
