import { Inject, Injectable } from "@nestjs/common";
import {
  activityLogs,
  aiAuditLogs,
  aiBotWebhookEvents,
  aiToolCalls,
  requestErrorLogs,
} from "@notes/db";
import {
  and,
  desc,
  eq,
  like,
  lt,
  or,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

import { DatabaseService } from "../database/database.service.js";
import { sanitizeDiagnosticMessage } from "../observability/request-context.js";
import {
  type AdminAuditListInput,
  type AdminAuditSource,
  type AdminDiagnosticListInput,
  type AdminDiagnosticSource,
  type AdminHistoryCursor,
  encodeAdminHistoryCursor,
} from "./admin-history.validation.js";

const AUDIT_RANK: Record<AdminAuditSource, number> = {
  activity: 1,
  ai: 2,
};
const DIAGNOSTIC_RANK: Record<AdminDiagnosticSource, number> = {
  ai_tool: 2,
  integration: 1,
  request: 3,
};

interface InternalHistoryItem<Source extends string> {
  createdAt: string;
  id: string;
  numericId: number;
  source: Source;
}

type InternalAuditItem = InternalHistoryItem<AdminAuditSource> & {
  action: string;
  actorId: number | null;
  detail: string | null;
  targetId: number | null;
  targetType: string | null;
  userId: number | null;
};

type InternalDiagnosticItem = InternalHistoryItem<AdminDiagnosticSource> & {
  correlationId: string;
  detail: string;
  severity: "critical" | "warning";
  title: string;
  userId: number | null;
};

function cursorCondition<Source extends string>(
  createdAt: SQLWrapper,
  id: SQLWrapper,
  source: Source,
  ranks: Record<Source, number>,
  cursor: AdminHistoryCursor<Source> | null,
): SQL | undefined {
  if (!cursor) return undefined;
  const rank = ranks[source];
  const cursorRank = ranks[cursor.source];
  if (rank < cursorRank) {
    return or(lt(createdAt, cursor.createdAt), eq(createdAt, cursor.createdAt));
  }
  if (rank > cursorRank) return lt(createdAt, cursor.createdAt);
  return or(
    lt(createdAt, cursor.createdAt),
    and(eq(createdAt, cursor.createdAt), lt(id, cursor.id)),
  );
}

function compareHistory<Source extends string>(
  ranks: Record<Source, number>,
  left: InternalHistoryItem<Source>,
  right: InternalHistoryItem<Source>,
): number {
  const timestamp = right.createdAt.localeCompare(left.createdAt);
  if (timestamp !== 0) return timestamp;
  const source = ranks[right.source] - ranks[left.source];
  return source === 0 ? right.numericId - left.numericId : source;
}

function safeDetail(value: unknown): string | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = "Details could not be serialized";
  }
  if (!serialized || serialized === "{}") return null;
  return sanitizeDiagnosticMessage(new Error(serialized));
}

function safeMessage(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? sanitizeDiagnosticMessage(new Error(value))
    : "Без дополнительных данных";
}

function page<Source extends AdminAuditSource | AdminDiagnosticSource>(
  rows: Array<InternalHistoryItem<Source>>,
  ranks: Record<Source, number>,
  limit: number,
) {
  rows.sort((left, right) => compareHistory(ranks, left, right));
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    items: selected.map(({ numericId, ...item }) => {
      void numericId;
      return item;
    }),
    nextCursor:
      hasMore && last
        ? encodeAdminHistoryCursor(
            new Date(last.createdAt),
            last.source,
            last.numericId,
          )
        : null,
  };
}

@Injectable()
export class AdminHistoryService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async listAudits(input: AdminAuditListInput) {
    const [activity, ai] = await Promise.all([
      this.listActivityAudits(input),
      this.listAiAudits(input),
    ]);
    return page([...activity, ...ai], AUDIT_RANK, input.limit);
  }

  async listDiagnostics(input: AdminDiagnosticListInput) {
    const [requests, tools, integrations] = await Promise.all([
      this.listRequestDiagnostics(input),
      this.listToolDiagnostics(input),
      this.listIntegrationDiagnostics(input),
    ]);
    return page(
      [...requests, ...tools, ...integrations],
      DIAGNOSTIC_RANK,
      input.limit,
    );
  }

  private async listActivityAudits(
    input: AdminAuditListInput,
  ): Promise<InternalAuditItem[]> {
    if (input.source === "ai" || input.scope === "ai") return [];
    const rows = await this.database.client
      .select()
      .from(activityLogs)
      .where(
        and(
          input.scope === "all"
            ? undefined
            : like(activityLogs.action, `${input.scope}.%`),
          input.userId === null
            ? undefined
            : or(
                eq(activityLogs.actorId, input.userId),
                eq(activityLogs.userId, input.userId),
              ),
          cursorCondition(
            activityLogs.createdAt,
            activityLogs.id,
            "activity",
            AUDIT_RANK,
            input.cursor,
          ),
        ),
      )
      .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
      .limit(input.limit + 1);
    return rows.map((row) => ({
      action: row.action,
      actorId: row.actorId,
      createdAt: row.createdAt.toISOString(),
      detail: safeDetail(row.details),
      id: `activity-${row.id}`,
      numericId: row.id,
      source: "activity",
      targetId: row.targetId,
      targetType: row.targetType,
      userId: row.userId,
    }));
  }

  private async listAiAudits(
    input: AdminAuditListInput,
  ): Promise<InternalAuditItem[]> {
    if (input.source === "activity" || !["all", "ai"].includes(input.scope)) {
      return [];
    }
    const rows = await this.database.client
      .select()
      .from(aiAuditLogs)
      .where(
        and(
          input.userId === null
            ? undefined
            : eq(aiAuditLogs.userId, input.userId),
          cursorCondition(
            aiAuditLogs.createdAt,
            aiAuditLogs.id,
            "ai",
            AUDIT_RANK,
            input.cursor,
          ),
        ),
      )
      .orderBy(desc(aiAuditLogs.createdAt), desc(aiAuditLogs.id))
      .limit(input.limit + 1);
    return rows.map((row) => ({
      action: row.action,
      actorId: row.userId,
      createdAt: row.createdAt.toISOString(),
      detail: safeDetail(row.details),
      id: `ai-${row.id}`,
      numericId: row.id,
      source: "ai",
      targetId: row.targetId,
      targetType: row.targetType,
      userId: row.userId,
    }));
  }

  private async listRequestDiagnostics(
    input: AdminDiagnosticListInput,
  ): Promise<InternalDiagnosticItem[]> {
    if (input.kind !== "all" && input.kind !== "request") return [];
    const rows = await this.database.client
      .select()
      .from(requestErrorLogs)
      .where(
        and(
          input.userId === null
            ? undefined
            : eq(requestErrorLogs.userId, input.userId),
          cursorCondition(
            requestErrorLogs.createdAt,
            requestErrorLogs.id,
            "request",
            DIAGNOSTIC_RANK,
            input.cursor,
          ),
        ),
      )
      .orderBy(desc(requestErrorLogs.createdAt), desc(requestErrorLogs.id))
      .limit(input.limit + 1);
    return rows.map((row) => ({
      correlationId: row.correlationId ?? `request:${row.id}`,
      createdAt: row.createdAt.toISOString(),
      detail: `${row.method} · ${row.statusCode} · ${row.durationMs} мс · ${safeMessage(row.message ?? row.errorName)}`,
      id: `request-${row.id}`,
      numericId: row.id,
      severity: row.statusCode >= 500 ? "critical" : "warning",
      source: "request",
      title: row.path,
      userId: row.userId,
    }));
  }

  private async listToolDiagnostics(
    input: AdminDiagnosticListInput,
  ): Promise<InternalDiagnosticItem[]> {
    if (input.kind !== "all" && input.kind !== "ai_tool") return [];
    const rows = await this.database.client
      .select()
      .from(aiToolCalls)
      .where(
        and(
          eq(aiToolCalls.status, "failed"),
          input.userId === null
            ? undefined
            : eq(aiToolCalls.userId, input.userId),
          cursorCondition(
            aiToolCalls.createdAt,
            aiToolCalls.id,
            "ai_tool",
            DIAGNOSTIC_RANK,
            input.cursor,
          ),
        ),
      )
      .orderBy(desc(aiToolCalls.createdAt), desc(aiToolCalls.id))
      .limit(input.limit + 1);
    return rows.map((row) => ({
      correlationId:
        row.correlationId ?? `tool:${row.id}:message:${row.messageId}`,
      createdAt: row.createdAt.toISOString(),
      detail: `${row.riskClass} · ${safeMessage(row.errorCode)}`,
      id: `ai-tool-${row.id}`,
      numericId: row.id,
      severity: "critical",
      source: "ai_tool",
      title: row.toolName,
      userId: row.userId,
    }));
  }

  private async listIntegrationDiagnostics(
    input: AdminDiagnosticListInput,
  ): Promise<InternalDiagnosticItem[]> {
    if (
      (input.kind !== "all" && input.kind !== "integration") ||
      input.userId !== null
    ) {
      return [];
    }
    const rows = await this.database.client
      .select()
      .from(aiBotWebhookEvents)
      .where(
        and(
          eq(aiBotWebhookEvents.status, "failed"),
          cursorCondition(
            aiBotWebhookEvents.createdAt,
            aiBotWebhookEvents.id,
            "integration",
            DIAGNOSTIC_RANK,
            input.cursor,
          ),
        ),
      )
      .orderBy(desc(aiBotWebhookEvents.createdAt), desc(aiBotWebhookEvents.id))
      .limit(input.limit + 1);
    return rows.map((row) => ({
      correlationId: row.correlationId,
      createdAt: row.createdAt.toISOString(),
      detail: `${row.eventType} · ${row.attempts} попыток · ${safeMessage(row.lastError)}`,
      id: `integration-${row.id}`,
      numericId: row.id,
      severity: "critical",
      source: "integration",
      title: row.provider === "telegram" ? "Telegram webhook" : "VK webhook",
      userId: null,
    }));
  }
}
