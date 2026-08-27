import { Inject, Injectable } from "@nestjs/common";
import {
  attachments,
  aiBotWebhookEvents,
  aiToolCalls,
  aiToolConfirmations,
  activityLogs,
  requestErrorLogs,
  subscriptionPlans,
  userSubscriptions,
  users,
} from "@notes/db";
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { Redis } from "ioredis";

import { DatabaseService } from "../database/database.service.js";
import { sanitizeDiagnosticMessage } from "../observability/request-context.js";

export interface ServiceProbe {
  detail: string;
  latencyMs: number | null;
  name: "object-storage" | "postgres" | "redis" | "worker";
  status: "degraded" | "ok";
}

function message(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? sanitizeDiagnosticMessage(new Error(value)).slice(0, 240)
    : "Без дополнительных данных";
}

@Injectable()
export class AdminOverviewService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getOverview() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [
      userCount,
      adminCount,
      recentUsers,
      criticalCount,
      warningCount,
      aiFailureCount,
      integrationFailureCount,
      pendingConfirmationCount,
      auditCount,
      storage,
      requestFailures,
      toolFailures,
      integrationFailures,
      services,
    ] = await Promise.all([
      this.database.client.select({ value: count() }).from(users),
      this.database.client
        .select({ value: count() })
        .from(users)
        .where(eq(users.role, "admin")),
      this.database.client
        .select({
          createdAt: users.createdAt,
          email: users.email,
          emailVerified: users.emailVerified,
          id: users.id,
          lastLoginAt: users.lastLoginAt,
          name: users.name,
          role: users.role,
        })
        .from(users)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(30),
      this.database.client
        .select({ value: count() })
        .from(requestErrorLogs)
        .where(
          and(
            gte(requestErrorLogs.createdAt, since),
            gte(requestErrorLogs.statusCode, 500),
          ),
        ),
      this.database.client
        .select({ value: count() })
        .from(requestErrorLogs)
        .where(
          and(
            gte(requestErrorLogs.createdAt, since),
            gte(requestErrorLogs.statusCode, 400),
            lt(requestErrorLogs.statusCode, 500),
          ),
        ),
      this.database.client
        .select({ value: count() })
        .from(aiToolCalls)
        .where(
          and(
            eq(aiToolCalls.status, "failed"),
            gte(aiToolCalls.createdAt, since),
          ),
        ),
      this.database.client
        .select({ value: count() })
        .from(aiBotWebhookEvents)
        .where(
          and(
            eq(aiBotWebhookEvents.status, "failed"),
            gte(aiBotWebhookEvents.createdAt, since),
          ),
        ),
      this.database.client
        .select({ value: count() })
        .from(aiToolConfirmations)
        .where(eq(aiToolConfirmations.status, "pending")),
      this.database.client
        .select({ value: count() })
        .from(activityLogs)
        .where(gte(activityLogs.createdAt, since)),
      this.database.client
        .select({
          bytes:
            sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::bigint`.mapWith(
              Number,
            ),
          files: count(),
        })
        .from(attachments)
        .where(eq(attachments.storageStatus, "ready")),
      this.database.client
        .select({
          correlationId: requestErrorLogs.correlationId,
          createdAt: requestErrorLogs.createdAt,
          durationMs: requestErrorLogs.durationMs,
          id: requestErrorLogs.id,
          message: requestErrorLogs.message,
          path: requestErrorLogs.path,
          statusCode: requestErrorLogs.statusCode,
          userId: requestErrorLogs.userId,
        })
        .from(requestErrorLogs)
        .orderBy(desc(requestErrorLogs.createdAt), desc(requestErrorLogs.id))
        .limit(12),
      this.database.client
        .select({
          correlationId: aiToolCalls.correlationId,
          createdAt: aiToolCalls.createdAt,
          errorCode: aiToolCalls.errorCode,
          id: aiToolCalls.id,
          messageId: aiToolCalls.messageId,
          toolName: aiToolCalls.toolName,
          userId: aiToolCalls.userId,
        })
        .from(aiToolCalls)
        .where(eq(aiToolCalls.status, "failed"))
        .orderBy(desc(aiToolCalls.createdAt), desc(aiToolCalls.id))
        .limit(12),
      this.database.client
        .select({
          attempts: aiBotWebhookEvents.attempts,
          correlationId: aiBotWebhookEvents.correlationId,
          createdAt: aiBotWebhookEvents.createdAt,
          id: aiBotWebhookEvents.id,
          lastError: aiBotWebhookEvents.lastError,
          provider: aiBotWebhookEvents.provider,
        })
        .from(aiBotWebhookEvents)
        .where(eq(aiBotWebhookEvents.status, "failed"))
        .orderBy(
          desc(aiBotWebhookEvents.createdAt),
          desc(aiBotWebhookEvents.id),
        )
        .limit(12),
      this.probeServices(),
    ]);

    const recentUserIds = recentUsers.map((user) => user.id);
    const [activeSubscriptions, freePlans] = await Promise.all([
      recentUserIds.length
        ? this.database.client
            .select({
              id: userSubscriptions.id,
              planId: subscriptionPlans.id,
              planName: subscriptionPlans.name,
              planSlug: subscriptionPlans.slug,
              startedAt: userSubscriptions.startedAt,
              userId: userSubscriptions.userId,
            })
            .from(userSubscriptions)
            .innerJoin(
              subscriptionPlans,
              eq(subscriptionPlans.id, userSubscriptions.planId),
            )
            .where(
              and(
                inArray(userSubscriptions.userId, recentUserIds),
                eq(userSubscriptions.status, "active"),
                or(
                  isNull(userSubscriptions.expiresAt),
                  gt(userSubscriptions.expiresAt, new Date()),
                ),
              ),
            )
            .orderBy(
              desc(userSubscriptions.startedAt),
              desc(userSubscriptions.id),
            )
        : Promise.resolve([]),
      this.database.client
        .select({
          planId: subscriptionPlans.id,
          planName: subscriptionPlans.name,
          planSlug: subscriptionPlans.slug,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.slug, "free"))
        .limit(1),
    ]);
    const subscriptionsByUser = new Map<
      number,
      (typeof activeSubscriptions)[number]
    >();
    for (const subscription of activeSubscriptions) {
      if (!subscriptionsByUser.has(subscription.userId)) {
        subscriptionsByUser.set(subscription.userId, subscription);
      }
    }
    const freePlan = freePlans[0];

    const recentFailures = [
      ...requestFailures.map((row) => ({
        correlationId: row.correlationId ?? `request:${row.id}`,
        createdAt: row.createdAt.toISOString(),
        detail: `${row.statusCode} · ${message(row.message)} · ${row.durationMs} мс`,
        id: `request-${row.id}`,
        kind: "request" as const,
        title: row.path,
        userId: row.userId,
      })),
      ...toolFailures.map((row) => ({
        correlationId:
          row.correlationId ?? `tool:${row.id}:message:${row.messageId}`,
        createdAt: row.createdAt.toISOString(),
        detail: message(row.errorCode),
        id: `tool-${row.id}`,
        kind: "ai_tool" as const,
        title: row.toolName,
        userId: row.userId,
      })),
      ...integrationFailures.map((row) => ({
        correlationId: row.correlationId,
        createdAt: row.createdAt.toISOString(),
        detail: `${row.attempts} попыток · ${message(row.lastError)}`,
        id: `integration-${row.id}`,
        kind: "integration" as const,
        title: row.provider === "telegram" ? "Telegram webhook" : "VK webhook",
        userId: null,
      })),
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 15);

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        aiFailures24h: aiFailureCount[0]?.value ?? 0,
        audits24h: auditCount[0]?.value ?? 0,
        critical24h: criticalCount[0]?.value ?? 0,
        integrationFailures24h: integrationFailureCount[0]?.value ?? 0,
        pendingConfirmations: pendingConfirmationCount[0]?.value ?? 0,
        warnings24h: warningCount[0]?.value ?? 0,
      },
      recentFailures,
      services,
      storage: {
        trackedBytes: storage[0]?.bytes ?? 0,
        trackedFiles: storage[0]?.files ?? 0,
      },
      users: {
        admins: adminCount[0]?.value ?? 0,
        items: recentUsers.map((user) => ({
          ...user,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          subscription: subscriptionsByUser.has(user.id)
            ? {
                id: subscriptionsByUser.get(user.id)!.id,
                planId: subscriptionsByUser.get(user.id)!.planId,
                planName: subscriptionsByUser.get(user.id)!.planName,
                planSlug: subscriptionsByUser.get(user.id)!.planSlug,
              }
            : freePlan
              ? { id: null, ...freePlan }
              : null,
        })),
        total: userCount[0]?.value ?? 0,
      },
    };
  }

  private async probeServices(): Promise<ServiceProbe[]> {
    return Promise.all([
      this.probe("postgres", "SQL отвечает", async () => {
        await this.database.client.execute(sql`select 1`);
      }),
      this.probe("redis", "Очереди и лимиты", async () => {
        const url = process.env.REDIS_URL;
        if (!url) throw new Error("REDIS_URL is missing");
        const redis = new Redis(url, {
          connectTimeout: 1_500,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
        try {
          await redis.connect();
          await redis.ping();
        } finally {
          redis.disconnect();
        }
      }),
      this.probe("object-storage", "S3 health endpoint", async () => {
        const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
        if (!endpoint) throw new Error("OBJECT_STORAGE_ENDPOINT is missing");
        const response = await fetch(`${endpoint}/minio/health/live`, {
          signal: AbortSignal.timeout(1_500),
        });
        if (!response.ok) throw new Error(`storage_${response.status}`);
      }),
      this.probe("worker", "Фоновые задачи", async () => {
        const endpoint =
          process.env.INTERNAL_WORKER_HEALTH_URL ?? "http://worker:3002/ready";
        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(1_500),
        });
        if (!response.ok) throw new Error(`worker_${response.status}`);
      }),
    ]);
  }

  private async probe(
    name: ServiceProbe["name"],
    detail: string,
    operation: () => Promise<void>,
  ): Promise<ServiceProbe> {
    const startedAt = performance.now();
    try {
      await operation();
      return {
        detail,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        name,
        status: "ok",
      };
    } catch {
      return {
        detail: "Нет ответа",
        latencyMs: null,
        name,
        status: "degraded",
      };
    }
  }
}
