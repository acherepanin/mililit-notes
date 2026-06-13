/**
 * Текущее время как строка ISO-8601. Таймстампы хранятся в `text`-колонках
 * (ISO-строки), поэтому сравниваются лексикографически и сохраняют тот же
 * формат, на который рассчитывают API и frontend.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Границы текущего календарного месяца в UTC [start, end) как ISO-строки.
 * Используется для месячных окон расхода/квот.
 */
export function currentMonthRangeIso(reference: Date = new Date()): {
  start: string;
  end: string;
} {
  const start = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1),
  ).toISOString();
  const end = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1),
  ).toISOString();
  return { start, end };
}
