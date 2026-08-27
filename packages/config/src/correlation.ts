const CORRELATION_ID = /^[a-zA-Z0-9._:-]{1,100}$/;

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID.test(value);
}
