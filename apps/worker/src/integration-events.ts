import { createHmac } from "node:crypto";

import {
  INTEGRATION_QUEUE,
  isIntegrationEventJob,
  type IntegrationEventJob,
} from "@notes/config";
import {
  aiBotWebhookEvents,
  createDatabase,
  createDatabasePool,
} from "@notes/db";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";

import { parseRedisConnection } from "./queue.js";
import type { WorkerMetrics } from "./metrics.js";
import { extractJobContext, traceJob } from "./telemetry.js";

export interface IntegrationEventsRuntime {
  close(): Promise<void>;
  ready(): Promise<void>;
}

export const INTEGRATION_EVENT_ATTEMPTS = 5;

export function integrationFailureSchedule(
  attemptsMade: number,
  maxAttempts = INTEGRATION_EVENT_ATTEMPTS,
): { exhausted: boolean; retryAt: Date } {
  const exhausted = attemptsMade >= maxAttempts;
  const delay = exhausted
    ? 0
    : Math.min(60_000, 1_000 * 2 ** Math.max(0, attemptsMade - 1));
  return { exhausted, retryAt: new Date(Date.now() + delay) };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown_error";
  return message.replaceAll(/[\r\n]/g, " ").slice(0, 500);
}

export function createIntegrationEventsRuntime(
  redisUrl: string,
  metrics: WorkerMetrics,
): IntegrationEventsRuntime {
  const pool = createDatabasePool(required("DATABASE_URL"), { max: 3 });
  const database = createDatabase(pool);
  const endpoint = required("INTERNAL_INTEGRATION_URL");
  const secret = required("INTERNAL_INTEGRATION_SECRET");
  const worker = new Worker<IntegrationEventJob>(
    INTEGRATION_QUEUE,
    async (job) => {
      if (!isIntegrationEventJob(job.data)) {
        throw new Error("invalid_integration_event_job");
      }
      return traceJob(
        extractJobContext(job.data),
        "integration-event process",
        {
          "messaging.destination.name": INTEGRATION_QUEUE,
          "messaging.operation.name": "process",
          "messaging.system": "bullmq",
          "notes.correlation_id": job.data.correlationId,
          "notes.integration_provider": job.data.provider,
        },
        () =>
          metrics.measureJob("integration-events", job.name, async () => {
            const now = new Date();
            await database
              .update(aiBotWebhookEvents)
              .set({
                attempts: job.attemptsMade + 1,
                lastError: null,
                lockedAt: now,
                status: "processing",
                updatedAt: now,
              })
              .where(eq(aiBotWebhookEvents.id, job.data.ledgerId));
            try {
              const timestamp = Date.now();
              const body = JSON.stringify(job.data);
              const signature = createHmac("sha256", secret)
                .update(`${timestamp}.${body}`)
                .digest("hex");
              const response = await fetch(endpoint, {
                body,
                headers: {
                  "content-type": "application/json",
                  "x-correlation-id": job.data.correlationId,
                  "x-notes-signature": signature,
                  "x-notes-timestamp": String(timestamp),
                },
                method: "POST",
                signal: AbortSignal.timeout(120_000),
              });
              if (!response.ok)
                throw new Error(`internal_api_${response.status}`);
            } catch (error) {
              const failure = integrationFailureSchedule(job.attemptsMade + 1);
              await database
                .update(aiBotWebhookEvents)
                .set({
                  availableAt: failure.retryAt,
                  completedAt: failure.exhausted ? new Date() : null,
                  lastError: safeError(error),
                  lockedAt: null,
                  status: "failed",
                  updatedAt: new Date(),
                })
                .where(eq(aiBotWebhookEvents.id, job.data.ledgerId));
              throw error;
            }
          }),
      );
    },
    {
      concurrency: 4,
      connection: parseRedisConnection(redisUrl),
      prefix: "notes",
    },
  );

  return {
    async close() {
      await worker.close();
      await pool.end();
    },
    async ready() {
      await worker.waitUntilReady();
    },
  };
}
