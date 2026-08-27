import { randomUUID } from "node:crypto";
import { isCorrelationId } from "@notes/config";

const SECRET_ASSIGNMENT =
  /\b(password|passwd|token|secret|authorization|api[-_\s]?key)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const URL_CREDENTIALS = /:\/\/([^:\s/@]+):([^@\s/]+)@/g;
const URL_SECRET_PARAMETER =
  /([?&](?:access_token|api_key|password|secret|token)=)[^&#\s]+/gi;

export function resolveCorrelationId(value: unknown): string {
  return isCorrelationId(value) ? value : randomUUID();
}

export function sanitizeDiagnosticMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : "Request failed";
  return message
    .replaceAll(/[\r\n]/g, " ")
    .replaceAll(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replaceAll(URL_CREDENTIALS, "://$1:[redacted]@")
    .replaceAll(URL_SECRET_PARAMETER, "$1[redacted]")
    .replaceAll(SECRET_ASSIGNMENT, "$1=[redacted]")
    .slice(0, 500);
}
