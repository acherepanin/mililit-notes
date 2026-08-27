import { BadRequestException } from "@nestjs/common";

export type AdminAuditSource = "activity" | "ai";
export type AdminAuditScope =
  "all" | "ai" | "files" | "integrations" | "notes" | "workspace";
export type AdminDiagnosticSource = "ai_tool" | "integration" | "request";

export interface AdminHistoryCursor<Source extends string> {
  createdAt: Date;
  id: number;
  source: Source;
}

export interface AdminAuditListInput {
  cursor: AdminHistoryCursor<AdminAuditSource> | null;
  limit: number;
  scope: AdminAuditScope;
  source: "all" | AdminAuditSource;
  userId: number | null;
}

export interface AdminDiagnosticListInput {
  cursor: AdminHistoryCursor<AdminDiagnosticSource> | null;
  kind: "all" | AdminDiagnosticSource;
  limit: number;
  userId: number | null;
}

const AUDIT_SOURCES = new Set<AdminAuditSource>(["activity", "ai"]);
const AUDIT_SCOPES = new Set<AdminAuditScope>([
  "all",
  "ai",
  "files",
  "integrations",
  "notes",
  "workspace",
]);
const DIAGNOSTIC_SOURCES = new Set<AdminDiagnosticSource>([
  "ai_tool",
  "integration",
  "request",
]);

function integer(
  value: unknown,
  field: string,
  fallback: number | null,
  maximum: number,
): number | null {
  if (value === undefined || value === "") return fallback;
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    !/^\d+$/.test(String(value))
  ) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new BadRequestException(`${field} is outside the allowed range`);
  }
  return parsed;
}

function option<Value extends string>(
  value: unknown,
  field: string,
  fallback: Value,
  allowed: ReadonlySet<Value>,
): Value {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !allowed.has(value as Value)) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value as Value;
}

function cursor<Source extends string>(
  value: unknown,
  allowedSources: ReadonlySet<Source>,
): AdminHistoryCursor<Source> | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 240) {
    throw new BadRequestException("cursor is invalid");
  }
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!Array.isArray(decoded) || decoded.length !== 3) throw new Error();
    const [timestamp, source, rawId] = decoded;
    if (
      typeof timestamp !== "string" ||
      typeof source !== "string" ||
      !allowedSources.has(source as Source)
    ) {
      throw new Error();
    }
    const createdAt = new Date(timestamp);
    const id = integer(rawId, "cursor.id", null, 2_147_483_647);
    if (Number.isNaN(createdAt.getTime()) || id === null) throw new Error();
    return { createdAt, id, source: source as Source };
  } catch {
    throw new BadRequestException("cursor is invalid");
  }
}

export function encodeAdminHistoryCursor(
  createdAt: Date,
  source: AdminAuditSource | AdminDiagnosticSource,
  id: number,
): string {
  return Buffer.from(
    JSON.stringify([createdAt.toISOString(), source, id]),
  ).toString("base64url");
}

export function parseAdminAuditList(
  rawCursor: unknown,
  rawLimit: unknown,
  rawSource: unknown,
  rawScope: unknown,
  rawUserId: unknown,
): AdminAuditListInput {
  const source = option(
    rawSource,
    "source",
    "all" as const,
    new Set(["all", ...AUDIT_SOURCES] as const),
  );
  const parsedCursor = cursor(rawCursor, AUDIT_SOURCES);
  if (source !== "all" && parsedCursor && parsedCursor.source !== source) {
    throw new BadRequestException("cursor does not match source");
  }
  return {
    cursor: parsedCursor,
    limit: integer(rawLimit, "limit", 20, 50) ?? 20,
    scope: option(rawScope, "scope", "all", AUDIT_SCOPES),
    source,
    userId: integer(rawUserId, "userId", null, 2_147_483_647),
  };
}

export function parseAdminDiagnosticList(
  rawCursor: unknown,
  rawLimit: unknown,
  rawKind: unknown,
  rawUserId: unknown,
): AdminDiagnosticListInput {
  const kind = option(
    rawKind,
    "kind",
    "all" as const,
    new Set(["all", ...DIAGNOSTIC_SOURCES] as const),
  );
  const parsedCursor = cursor(rawCursor, DIAGNOSTIC_SOURCES);
  if (kind !== "all" && parsedCursor && parsedCursor.source !== kind) {
    throw new BadRequestException("cursor does not match kind");
  }
  return {
    cursor: parsedCursor,
    kind,
    limit: integer(rawLimit, "limit", 20, 50) ?? 20,
    userId: integer(rawUserId, "userId", null, 2_147_483_647),
  };
}
