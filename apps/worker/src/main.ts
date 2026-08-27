import "./telemetry.js";

import Fastify from "fastify";
import { readServiceEnvironment, readSmtpEnvironment } from "@notes/config";

import { createAuthEmailRuntime } from "./auth-email.js";
import { createWorkerHealthResponse } from "./health.js";
import { createIntegrationEventsRuntime } from "./integration-events.js";
import { WorkerMetrics } from "./metrics.js";
import { createSystemQueue, pingQueue } from "./queue.js";
import { createSystemJobsRuntime } from "./system-jobs.js";
import { shutdownTelemetry } from "./telemetry.js";

async function bootstrap(): Promise<void> {
  const environment = readServiceEnvironment(process.env, 3002);
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const app = Fastify({ logger: true });
  const metrics = new WorkerMetrics();
  const systemQueue = createSystemQueue(redisUrl);
  const authEmail = createAuthEmailRuntime(
    redisUrl,
    readSmtpEnvironment(process.env),
    metrics,
  );
  const integrationEvents = createIntegrationEventsRuntime(redisUrl, metrics);
  const systemJobs = createSystemJobsRuntime(
    redisUrl,
    systemQueue,
    app.log,
    metrics,
  );

  await Promise.all([
    systemQueue.waitUntilReady(),
    authEmail.ready(),
    integrationEvents.ready(),
    systemJobs.ready(),
  ]);

  app.get("/health", async () => createWorkerHealthResponse());
  app.get("/metrics", async (_request, reply) =>
    reply.type(metrics.contentType).send(await metrics.render()),
  );
  app.get("/ready", async (_request, reply) => {
    try {
      await pingQueue(systemQueue);
      return createWorkerHealthResponse();
    } catch {
      return reply
        .status(503)
        .send({ service: "worker", status: "unavailable" });
    }
  });

  const close = async (): Promise<void> => {
    await app.close();
    await systemJobs.close();
    await integrationEvents.close();
    await authEmail.close();
    await systemQueue.close();
    await shutdownTelemetry();
    process.exitCode = 0;
  };

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());

  await app.listen({ host: environment.HOST, port: environment.PORT });
}

void bootstrap();
