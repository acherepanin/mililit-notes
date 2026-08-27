import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createDatabasePool } from "@notes/db";

import { createSystemQueue } from "../src/queue.js";
import {
  cleanupDataRetention,
  RETENTION_CLEANUP_EVERY_MS,
  RETENTION_CLEANUP_JOB,
  RETENTION_CLEANUP_SCHEDULER,
} from "../src/retention-cleanup.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:56379";
const database = createDatabasePool(databaseUrl, { max: 1 });
const queue = createSystemQueue(redisUrl);
const suffix = randomUUID();
const now = new Date();
const oldAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1_000);
const freshAt = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1_000);

try {
  const scheduler = await queue.getJobScheduler(RETENTION_CLEANUP_SCHEDULER);
  assert.equal(scheduler?.name, RETENTION_CLEANUP_JOB);
  assert.equal(scheduler?.every, RETENTION_CLEANUP_EVERY_MS);

  await database.query("begin");
  const user = await database.query<{ id: number }>(
    `insert into users (username, auth_name, auth_email, email_verified)
     values ($1, 'Retention verification', $2, true)
     returning id`,
    [`retention_${suffix}`, `retention_${suffix}@notes.local`],
  );
  const userId = user.rows[0]?.id;
  assert.ok(userId);
  await database.query(
    `update data_retention_policies
        set enabled = true, retention_days = 7
      where policy_key = any($1::text[])`,
    [
      [
        "activity_logs",
        "ai_audit_logs",
        "ai_bot_webhook_events",
        "request_error_logs",
      ],
    ],
  );

  const requestIds = await database.query<{ id: number }>(
    `insert into request_error_logs
       (user_id, method, path, status_code, duration_ms, created_at)
     values ($1, 'GET', $2, 500, 1, $3),
            ($1, 'GET', $4, 500, 1, $5)
     returning id`,
    [
      userId,
      `/retention-old-${suffix}`,
      oldAt,
      `/retention-fresh-${suffix}`,
      freshAt,
    ],
  );
  const activityIds = await database.query<{ id: number }>(
    `insert into activity_logs
       (actor_id, user_id, action, target_type, created_at)
     values ($1, $1, $2, 'verification', $3),
            ($1, $1, $4, 'verification', $5)
     returning id`,
    [
      userId,
      `retention.old.${suffix}`,
      oldAt,
      `retention.fresh.${suffix}`,
      freshAt,
    ],
  );
  const auditIds = await database.query<{ id: number }>(
    `insert into ai_audit_logs (user_id, action, created_at)
     values ($1, $2, $3), ($1, $4, $5)
     returning id`,
    [
      userId,
      `retention.old.${suffix}`,
      oldAt,
      `retention.fresh.${suffix}`,
      freshAt,
    ],
  );
  const webhookIds = await database.query<{ id: number }>(
    `insert into ai_bot_webhook_events
       (provider, event_id, event_type, payload_hash, status,
        correlation_id, created_at, updated_at)
     values
       ('telegram', $1, 'message', $2, 'succeeded', $3, $4, $4),
       ('telegram', $5, 'message', $6, 'processing', $7, $4, $4),
       ('telegram', $8, 'message', $9, 'succeeded', $10, $11, $11)
     returning id`,
    [
      `old-${suffix}`,
      `hash-old-${suffix}`,
      `correlation-old-${suffix}`,
      oldAt,
      `processing-${suffix}`,
      `hash-processing-${suffix}`,
      `correlation-processing-${suffix}`,
      `fresh-${suffix}`,
      `hash-fresh-${suffix}`,
      `correlation-fresh-${suffix}`,
      freshAt,
    ],
  );

  const result = await cleanupDataRetention(database, now);
  assert.equal(result.failed, 0);
  assert.equal(result.policies.length, 4);

  async function remaining(table: string, ids: number[]): Promise<number[]> {
    assert.match(table, /^[a-z_]+$/);
    const rows = await database.query<{ id: number }>(
      `select id from ${table} where id = any($1::integer[]) order by id`,
      [ids],
    );
    return rows.rows.map((row) => row.id);
  }

  assert.deepEqual(
    await remaining(
      "request_error_logs",
      requestIds.rows.map((row) => row.id),
    ),
    [requestIds.rows[1]?.id],
  );
  assert.deepEqual(
    await remaining(
      "activity_logs",
      activityIds.rows.map((row) => row.id),
    ),
    [activityIds.rows[1]?.id],
  );
  assert.deepEqual(
    await remaining(
      "ai_audit_logs",
      auditIds.rows.map((row) => row.id),
    ),
    [auditIds.rows[1]?.id],
  );
  assert.deepEqual(
    await remaining(
      "ai_bot_webhook_events",
      webhookIds.rows.map((row) => row.id),
    ),
    [webhookIds.rows[1]?.id, webhookIds.rows[2]?.id].sort((a, b) => a! - b!),
  );

  const states = await database.query<{
    lastCompletedAt: Date | null;
    lastError: string | null;
    lastStartedAt: Date | null;
  }>(
    `select last_started_at as "lastStartedAt",
            last_completed_at as "lastCompletedAt",
            last_error as "lastError"
       from data_retention_policies`,
  );
  assert.equal(states.rows.length, 4);
  for (const state of states.rows) {
    assert.equal(state.lastError, null);
    assert.equal(state.lastStartedAt?.toISOString(), now.toISOString());
    assert.equal(state.lastCompletedAt?.toISOString(), now.toISOString());
  }
  console.log("Data retention verification passed");
} finally {
  try {
    await database.query("rollback");
  } finally {
    await Promise.all([database.end(), queue.close()]);
  }
}
