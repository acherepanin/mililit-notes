import { createHash, timingSafeEqual } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { INTEGRATION_QUEUE, type IntegrationEventJob } from "@notes/config";
import { aiBotWebhookEvents } from "@notes/db";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { Redis } from "ioredis";

import { canonicalJsonSha256 } from "../ai/canonical-json.js";
import { DatabaseService } from "../database/database.service.js";
import { CorrelationContextService } from "../observability/correlation-context.service.js";
import { IntegrationSettingsService } from "./integration-settings.service.js";
import type { IntegrationProvider } from "./integrations.types.js";

const tracer = trace.getTracer("notes-api");

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Webhook payload must be an object");
  }
  return value as Record<string, unknown>;
}

function child(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const result = value[key];
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
}

function stringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim())
    return value.trim().slice(0, 128);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  return null;
}

@Injectable()
export class IntegrationWebhookService
  implements OnModuleDestroy, OnModuleInit
{
  private readonly redis: Redis;
  private readonly queue: Queue<IntegrationEventJob>;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationSettingsService)
    private readonly settings: IntegrationSettingsService,
    @Inject(CorrelationContextService)
    private readonly correlation: CorrelationContextService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("REDIS_URL is required");
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<IntegrationEventJob>(INTEGRATION_QUEUE, {
      connection: this.redis,
      prefix: "notes",
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.waitUntilReady();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.redis.quit();
  }

  async acceptTelegram(
    value: unknown,
    secretHeader: string | undefined,
    source: string,
  ) {
    const admin = await this.settings.getRuntimeAdminSettings("telegram");
    this.verifySecret(
      this.settings.decryptSecret(admin.secretEncrypted),
      secretHeader,
    );
    await this.assertRateLimit("telegram", source, 180, 60);
    const payload = object(value);
    const eventId = stringId(payload.update_id);
    if (!eventId)
      throw new BadRequestException("Telegram update_id is required");
    const message = child(payload, "message");
    const callback = child(payload, "callback_query");
    const externalId =
      stringId(child(message, "from").id) ??
      stringId(child(callback, "from").id);
    const eventType =
      Object.keys(payload).find((key) => key !== "update_id") ?? "unknown";
    return this.enqueue("telegram", eventId, eventType, externalId, payload);
  }

  async acceptVk(value: unknown, source: string): Promise<string> {
    const admin = await this.settings.getRuntimeAdminSettings("vk");
    const payload = object(value);
    this.verifySecret(
      this.settings.decryptSecret(admin.secretEncrypted),
      typeof payload.secret === "string" ? payload.secret : undefined,
    );
    if (admin.groupId && stringId(payload.group_id) !== admin.groupId) {
      throw new ForbiddenException("Invalid VK group id");
    }
    if (payload.type === "confirmation") {
      if (!admin.confirmationCode) {
        throw new BadRequestException("VK confirmation code is not configured");
      }
      return admin.confirmationCode;
    }
    await this.assertRateLimit("vk", source, 180, 60);
    const eventId =
      stringId(payload.event_id) ?? `hash:${canonicalJsonSha256(payload)}`;
    const message = child(child(payload, "object"), "message");
    const externalId = stringId(message.from_id);
    const eventType =
      typeof payload.type === "string" && payload.type.trim()
        ? payload.type.trim().slice(0, 100)
        : "unknown";
    await this.enqueue("vk", eventId, eventType, externalId, payload);
    return "ok";
  }

  private async enqueue(
    provider: IntegrationProvider,
    eventId: string,
    eventType: string,
    externalId: string | null,
    payload: Record<string, unknown>,
  ) {
    const payloadHash = canonicalJsonSha256(payload);
    const correlationId = this.correlation.getOrCreate();
    const [created] = await this.database.client
      .insert(aiBotWebhookEvents)
      .values({
        correlationId,
        eventId,
        eventType,
        externalId,
        payloadHash,
        provider,
      })
      .onConflictDoNothing({
        target: [aiBotWebhookEvents.provider, aiBotWebhookEvents.eventId],
      })
      .returning();

    let ledger = created;
    if (!ledger) {
      [ledger] = await this.database.client
        .select()
        .from(aiBotWebhookEvents)
        .where(
          and(
            eq(aiBotWebhookEvents.provider, provider),
            eq(aiBotWebhookEvents.eventId, eventId),
          ),
        )
        .limit(1);
      if (!ledger) throw new Error("Webhook ledger row disappeared");
      if (ledger.payloadHash !== payloadHash) {
        throw new ConflictException(
          "Webhook event ID was reused with another payload",
        );
      }
      if (ledger.status === "processing" || ledger.status === "succeeded") {
        return {
          accepted: true,
          correlationId: ledger.correlationId,
          duplicate: true,
        };
      }
    }

    const jobId = createHash("sha256")
      .update(`${provider}\0${eventId}`)
      .digest("hex");
    try {
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "failed" && ledger.status === "failed") {
          await existing.remove();
        } else {
          return {
            accepted: true,
            correlationId: ledger.correlationId,
            duplicate: true,
          };
        }
      }
      await tracer.startActiveSpan(
        "integration-event enqueue",
        {
          attributes: {
            "messaging.destination.name": INTEGRATION_QUEUE,
            "messaging.operation.name": "publish",
            "messaging.system": "bullmq",
            "notes.correlation_id": ledger.correlationId,
            "notes.integration_provider": provider,
          },
          kind: SpanKind.PRODUCER,
        },
        async (span) => {
          try {
            const carrier: Record<string, string> = {};
            propagation.inject(context.active(), carrier);
            await this.queue.add(
              "process",
              {
                correlationId: ledger.correlationId,
                eventId,
                ledgerId: ledger.id,
                payload,
                provider,
                ...(carrier.traceparent
                  ? { traceparent: carrier.traceparent }
                  : {}),
                ...(carrier.tracestate
                  ? { tracestate: carrier.tracestate }
                  : {}),
              },
              {
                attempts: 5,
                backoff: { delay: 1_000, type: "exponential" },
                jobId,
                removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
                removeOnFail: { age: 7 * 24 * 60 * 60, count: 2_000 },
              },
            );
          } catch (error) {
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        },
      );
      await this.database.client
        .update(aiBotWebhookEvents)
        .set({ lastError: null, status: "received", updatedAt: new Date() })
        .where(eq(aiBotWebhookEvents.id, ledger.id));
    } catch {
      await this.database.client
        .update(aiBotWebhookEvents)
        .set({
          lastError: "queue_unavailable",
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(aiBotWebhookEvents.id, ledger.id));
      throw new ServiceUnavailableException("Integration queue is unavailable");
    }
    return {
      accepted: true,
      correlationId: ledger.correlationId,
      duplicate: false,
    };
  }

  private verifySecret(
    expected: string | null,
    supplied: string | undefined,
  ): void {
    if (!expected || !supplied)
      throw new ForbiddenException("Invalid webhook secret");
    const expectedValue = Buffer.from(expected);
    const suppliedValue = Buffer.from(supplied);
    if (
      expectedValue.length !== suppliedValue.length ||
      !timingSafeEqual(expectedValue, suppliedValue)
    ) {
      throw new ForbiddenException("Invalid webhook secret");
    }
  }

  private async assertRateLimit(
    provider: IntegrationProvider,
    source: string,
    max: number,
    seconds: number,
  ): Promise<void> {
    const key = `notes:integrations:webhook:${provider}:${createHash("sha256")
      .update(source)
      .digest("hex")}`;
    const result = await this.redis
      .multi()
      .incr(key)
      .expire(key, seconds, "NX")
      .exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    if (count > max) {
      throw new HttpException(
        "Webhook rate limit exceeded",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
