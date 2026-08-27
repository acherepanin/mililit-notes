import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { INTEGRATION_QUEUE, type IntegrationEventJob } from "@notes/config";
import { createDatabasePool } from "@notes/db";
import { Queue } from "bullmq";

import { parseRedisConnection } from "../src/queue.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:56379";
const database = createDatabasePool(databaseUrl, { max: 1 });
const queue = new Queue<IntegrationEventJob>(INTEGRATION_QUEUE, {
  connection: parseRedisConnection(redisUrl),
  prefix: "notes",
});
const suffix = randomUUID();
const correlationId = `phase9-worker-${suffix}`;
const eventId = `correlation-${suffix}`;
const payload = { update_id: eventId };
const payloadHash = createHash("sha256")
  .update(JSON.stringify(payload))
  .digest("hex");
const jobId = createHash("sha256").update(`telegram\0${eventId}`).digest("hex");
let ledgerId = 0;

try {
  const staleJobs = await queue.getJobs(["completed", "failed"], 0, 1_000);
  for (const job of staleJobs) {
    if (job.data.correlationId.startsWith("phase9-worker-")) {
      await job.remove();
    }
  }
  const inserted = await database.query<{ id: number }>(
    `insert into ai_bot_webhook_events
       (provider, event_id, event_type, payload_hash, correlation_id)
     values ('telegram', $1, 'correlation_probe', $2, $3)
     returning id`,
    [eventId, payloadHash, correlationId],
  );
  ledgerId = inserted.rows[0]?.id ?? 0;
  assert.ok(ledgerId);
  await queue.add(
    "process",
    {
      correlationId,
      eventId,
      ledgerId,
      payload,
      provider: "telegram",
    },
    { jobId, removeOnComplete: false, removeOnFail: false },
  );

  const deadline = Date.now() + 20_000;
  let status = "received";
  let storedCorrelation = "";
  let lastError: string | null = null;
  while (Date.now() < deadline) {
    const result = await database.query<{
      correlation_id: string;
      last_error: string | null;
      status: string;
    }>(
      `select correlation_id, last_error, status
         from ai_bot_webhook_events
        where id = $1`,
      [ledgerId],
    );
    const row = result.rows[0];
    assert.ok(row);
    status = row.status;
    storedCorrelation = row.correlation_id;
    lastError = row.last_error;
    if (status === "succeeded" || status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(storedCorrelation, correlationId);
  if (status === "failed") {
    assert.equal(lastError, "internal_api_400");
    const diagnostic = await database.query<{ count: number }>(
      `select count(*)::int as count
         from request_error_logs
        where correlation_id = $1
          and path = '/api/internal/integrations/process'
          and status_code = 400`,
      [correlationId],
    );
    assert.equal(diagnostic.rows[0]?.count, 1);
  } else {
    assert.equal(status, "succeeded");
  }
  console.log("Cross-process correlation verification passed");
} finally {
  const job = await queue.getJob(jobId);
  if (job && ((await job.isCompleted()) || (await job.isFailed()))) {
    await job.remove();
  }
  if (ledgerId) {
    await database.query(
      "delete from request_error_logs where correlation_id = $1",
      [correlationId],
    );
    await database.query(
      "delete from ai_bot_webhook_events where id = $1 and status in ('succeeded', 'failed')",
      [ledgerId],
    );
  }
  await queue.close();
  await database.end();
}
