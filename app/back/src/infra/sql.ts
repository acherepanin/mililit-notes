type SqlListValue = number | string;

interface SqlListBinding<T extends SqlListValue> {
  params: Record<string, T>;
  placeholders: string;
}

export function bindSqlList<T extends SqlListValue>(
  prefix: string,
  values: readonly T[],
): SqlListBinding<T> {
  return {
    params: Object.fromEntries(values.map((value, index) => [`${prefix}${index}`, value])),
    placeholders: values.map((_, index) => `@${prefix}${index}`).join(', '),
  };
}
