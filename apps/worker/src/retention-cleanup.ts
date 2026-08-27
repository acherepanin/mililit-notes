import {
  dataRetentionPolicyKeys,
  type DataRetentionPolicyKey,
} from "@notes/db";
import type { createDatabasePool } from "@notes/db";

export const RETENTION_CLEANUP_JOB = "system.cleanup-data-retention";
export const RETENTION_CLEANUP_SCHEDULER = "data-retention-cleanup";
export const RETENTION_CLEANUP_EVERY_MS = 60 * 60 * 1_000;

const BATCH_SIZE = 500;
const MAX_BATCHES = 20;

type RetentionDatabase = ReturnType<typeof createDatabasePool>;

interface RetentionPolicyRow {
  id: number;
  policyKey: DataRetentionPolicyKey;
  retentionDays: number;
}

export interface RetentionCleanupPolicyResult {
  deleted: number;
  error: "backlog_remaining" | "cleanup_failed" | null;
  policyKey: DataRetentionPolicyKey;
}

export interface RetentionCleanupResult {
  deleted: number;
  failed: number;
  policies: RetentionCleanupPolicyResult[];
}

const policyKeySet = new Set<string>(dataRetentionPolicyKeys);

const deleteQueries: Record<DataRetentionPolicyKey, string> = {
  activity_logs: `with candidates as (
    select id from activity_logs
    where created_at < $1
    order by created_at, id
    for update skip locked
    limit $2
  ), deleted as (
    delete from activity_logs as target
    using candidates
    where target.id = candidates.id
    returning target.id
  ) select count(*)::int as count from deleted`,
  ai_audit_logs: `with candidates as (
    select id from ai_audit_logs
    where created_at < $1
    order by created_at, id
    for update skip locked
    limit $2
  ), deleted as (
    delete from ai_audit_logs as target
    using candidates
    where target.id = candidates.id
    returning target.id
  ) select count(*)::int as count from deleted`,
  ai_bot_webhook_events: `with candidates as (
    select id from ai_bot_webhook_events
    where created_at < $1 and status in ('succeeded', 'failed')
    order by created_at, id
    for update skip locked
    limit $2
  ), deleted as (
    delete from ai_bot_webhook_events as target
    using candidates
    where target.id = candidates.id
    returning target.id
  ) select count(*)::int as count from deleted`,
  request_error_logs: `with candidates as (
    select id from request_error_logs
    where created_at < $1
    order by created_at, id
    for update skip locked
    limit $2
  ), deleted as (
    delete from request_error_logs as target
    using candidates
    where target.id = candidates.id
    returning target.id
  ) select count(*)::int as count from deleted`,
};

async function deletePolicyBatch(
  database: RetentionDatabase,
  policyKey: DataRetentionPolicyKey,
  threshold: Date,
): Promise<number> {
  const result = await database.query<{ count: number }>(
    deleteQueries[policyKey],
    [threshold, BATCH_SIZE],
  );
  return result.rows[0]?.count ?? 0;
}

async function recordState(
  database: RetentionDatabase,
  id: number,
  state: {
    completedAt?: Date;
    deleted: number;
    error: RetentionCleanupPolicyResult["error"];
    startedAt?: Date;
  },
): Promise<void> {
  await database.query(
    `update data_retention_policies
        set last_started_at = coalesce($2, last_started_at),
            last_completed_at = coalesce($3, last_completed_at),
            last_deleted_count = $4,
            last_error = $5
      where id = $1`,
    [
      id,
      state.startedAt ?? null,
      state.completedAt ?? null,
      state.deleted,
      state.error,
    ],
  );
}

export async function cleanupDataRetention(
  database: RetentionDatabase,
  now = new Date(),
): Promise<RetentionCleanupResult> {
  const result = await database.query<RetentionPolicyRow>(
    `select id, policy_key as "policyKey", retention_days as "retentionDays"
       from data_retention_policies
      where enabled = true
      order by id`,
  );
  const policies: RetentionCleanupPolicyResult[] = [];

  for (const policy of result.rows) {
    if (!policyKeySet.has(policy.policyKey)) continue;
    let deleted = 0;
    await recordState(database, policy.id, {
      deleted: 0,
      error: null,
      startedAt: now,
    });
    try {
      const threshold = new Date(
        now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1_000,
      );
      let batches = 0;
      let lastBatchSize = 0;
      while (batches < MAX_BATCHES) {
        lastBatchSize = await deletePolicyBatch(
          database,
          policy.policyKey,
          threshold,
        );
        deleted += lastBatchSize;
        batches += 1;
        if (lastBatchSize < BATCH_SIZE) break;
      }
      const error =
        batches === MAX_BATCHES && lastBatchSize === BATCH_SIZE
          ? "backlog_remaining"
          : null;
      await recordState(database, policy.id, {
        ...(error ? {} : { completedAt: now }),
        deleted,
        error,
      });
      policies.push({ deleted, error, policyKey: policy.policyKey });
    } catch {
      await recordState(database, policy.id, {
        deleted,
        error: "cleanup_failed",
      });
      policies.push({
        deleted,
        error: "cleanup_failed",
        policyKey: policy.policyKey,
      });
    }
  }

  return {
    deleted: policies.reduce((total, policy) => total + policy.deleted, 0),
    failed: policies.filter((policy) => policy.error !== null).length,
    policies,
  };
}
