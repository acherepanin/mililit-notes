import { createDatabasePool } from "@notes/db";
import { Worker, type Queue } from "bullmq";

import { parseRedisConnection } from "./queue.js";
import type { WorkerMetrics } from "./metrics.js";
import {
  cleanupDataRetention,
  RETENTION_CLEANUP_EVERY_MS,
  RETENTION_CLEANUP_JOB,
  RETENTION_CLEANUP_SCHEDULER,
} from "./retention-cleanup.js";
import {
  cleanupExpiredUploads,
  createUploadCleanupStorage,
  UPLOAD_CLEANUP_EVERY_MS,
  UPLOAD_CLEANUP_JOB,
  UPLOAD_CLEANUP_SCHEDULER,
} from "./upload-cleanup.js";

interface SystemJobsLogger {
  error(context: object, message: string): void;
  info(context: object, message: string): void;
}

export interface SystemJobsRuntime {
  close(): Promise<void>;
  ready(): Promise<void>;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const jobOptions = {
  attempts: 5,
  backoff: { delay: 5_000, type: "exponential" as const },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
};

export function createSystemJobsRuntime(
  redisUrl: string,
  queue: Queue,
  logger: SystemJobsLogger,
  metrics: WorkerMetrics,
): SystemJobsRuntime {
  const database = createDatabasePool(required("DATABASE_URL"), { max: 2 });
  const storage = createUploadCleanupStorage();
  const worker = new Worker(
    "system",
    async (job) =>
      metrics.measureJob("system", job.name, async () => {
        if (job.name === UPLOAD_CLEANUP_JOB) {
          const result = await cleanupExpiredUploads(database, storage);
          logger.info(result, "Expired upload cleanup completed");
          if (result.failed > 0 || result.hasMore) {
            throw new Error("Upload cleanup incomplete");
          }
          return result;
        }
        if (job.name === RETENTION_CLEANUP_JOB) {
          const result = await cleanupDataRetention(database);
          logger.info(result, "Data retention cleanup completed");
          if (result.failed > 0)
            throw new Error("Retention cleanup incomplete");
          return result;
        }
        throw new Error("Unsupported system job");
      }),
    {
      concurrency: 1,
      connection: parseRedisConnection(redisUrl),
      prefix: "notes",
    },
  );
  worker.on("error", (error) => {
    logger.error({ error: error.name }, "System worker error");
  });

  return {
    async close() {
      await worker.close();
      await database.end();
      storage.close();
    },
    async ready() {
      await worker.waitUntilReady();
      const [uploadScheduler, retentionScheduler] = await Promise.all([
        queue.getJobScheduler(UPLOAD_CLEANUP_SCHEDULER),
        queue.getJobScheduler(RETENTION_CLEANUP_SCHEDULER),
      ]);
      await Promise.all([
        queue.upsertJobScheduler(
          UPLOAD_CLEANUP_SCHEDULER,
          { every: UPLOAD_CLEANUP_EVERY_MS },
          { data: {}, name: UPLOAD_CLEANUP_JOB, opts: jobOptions },
        ),
        queue.upsertJobScheduler(
          RETENTION_CLEANUP_SCHEDULER,
          { every: RETENTION_CLEANUP_EVERY_MS },
          { data: {}, name: RETENTION_CLEANUP_JOB, opts: jobOptions },
        ),
      ]);
      const startupJobs = [];
      if (!uploadScheduler) {
        startupJobs.push(
          queue.add(
            UPLOAD_CLEANUP_JOB,
            {},
            {
              ...jobOptions,
              jobId: "files-cleanup-startup",
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        );
      }
      if (!retentionScheduler) {
        startupJobs.push(
          queue.add(
            RETENTION_CLEANUP_JOB,
            {},
            {
              ...jobOptions,
              jobId: "retention-cleanup-startup",
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        );
      }
      await Promise.all(startupJobs);
    },
  };
}
