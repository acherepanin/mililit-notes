import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { createDatabasePool } from "@notes/db";

export const UPLOAD_CLEANUP_JOB = "files.cleanup-expired-uploads";
export const UPLOAD_CLEANUP_SCHEDULER = "files-upload-cleanup";

const BATCH_SIZE = 100;
const MAX_BATCHES = 20;
const STORAGE_CONCURRENCY = 10;
const COMPLETING_STALE_MS = 60 * 60 * 1_000;
const EXPIRING_RETRY_MS = 15 * 60 * 1_000;
const SCHEDULE_EVERY_MS = 15 * 60 * 1_000;

type CleanupDatabase = ReturnType<typeof createDatabasePool>;

interface ClaimedUpload {
  id: number;
  multipartUploadId: string | null;
  objectKey: string;
}

export interface UploadCleanupResult {
  claimed: number;
  expired: number;
  failed: number;
  hasMore: boolean;
}

export interface UploadCleanupStorage {
  discardMultipart(objectKey: string, uploadId: string | null): Promise<void>;
}

function required(
  source: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isMissingMultipart(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("name" in error && error.name === "NoSuchUpload") return true;
  if ("$metadata" in error) {
    const metadata = error.$metadata;
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "httpStatusCode" in metadata &&
      metadata.httpStatusCode === 404
    );
  }
  return false;
}

export function createUploadCleanupStorage(
  source: Readonly<Record<string, string | undefined>> = process.env,
): UploadCleanupStorage & { close(): void } {
  const bucket = required(source, "OBJECT_STORAGE_BUCKET");
  const client = new S3Client({
    credentials: {
      accessKeyId: required(source, "OBJECT_STORAGE_ACCESS_KEY"),
      secretAccessKey: required(source, "OBJECT_STORAGE_SECRET_KEY"),
    },
    endpoint: required(source, "OBJECT_STORAGE_ENDPOINT"),
    forcePathStyle: true,
    region: source.OBJECT_STORAGE_REGION?.trim() || "us-east-1",
  });

  return {
    close() {
      client.destroy();
    },
    async discardMultipart(objectKey, uploadId) {
      if (uploadId) {
        try {
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: objectKey,
              UploadId: uploadId,
            }),
          );
        } catch (error) {
          if (!isMissingMultipart(error)) throw error;
        }
      }
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
    },
  };
}

async function claimExpiredUploads(
  database: CleanupDatabase,
  now: Date,
): Promise<ClaimedUpload[]> {
  const completingBefore = new Date(now.getTime() - COMPLETING_STALE_MS);
  const retryBefore = new Date(now.getTime() - EXPIRING_RETRY_MS);
  const result = await database.query<ClaimedUpload>(
    `with candidates as (
       select id
       from attachment_uploads
       where (
         status in ('preparing', 'uploading') and expires_at <= $1
       ) or (
         status = 'completing' and expires_at <= $1 and updated_at <= $2
       ) or (
         status = 'expiring' and updated_at <= $3
       )
       order by expires_at, id
       for update skip locked
       limit $4
     ), claimed as (
       update attachment_uploads as upload
       set status = 'expiring', updated_at = $1
       from candidates
       where upload.id = candidates.id
       returning upload.id, upload.object_key as "objectKey",
         upload.multipart_upload_id as "multipartUploadId"
     )
     select * from claimed order by id`,
    [now, completingBefore, retryBefore, BATCH_SIZE],
  );
  return result.rows;
}

async function markExpired(
  database: CleanupDatabase,
  ids: number[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await database.query<{ id: number }>(
    `with expired as (
       update attachment_uploads
       set status = 'expired', updated_at = $2
       where id = any($1::integer[]) and status = 'expiring'
       returning id, user_id
     ), audit as (
       insert into activity_logs (
         actor_id, user_id, action, target_type, target_id, details
       )
       select null, user_id, 'files.upload_expired',
         'attachment_upload', id, '{"reason":"expired_session"}'::jsonb
       from expired
     )
     select id from expired`,
    [ids, now],
  );
  return result.rowCount ?? 0;
}

export async function cleanupExpiredUploads(
  database: CleanupDatabase,
  storage: UploadCleanupStorage,
  now = new Date(),
): Promise<UploadCleanupResult> {
  let claimed = 0;
  let expired = 0;
  let failed = 0;
  let lastBatchSize = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const uploads = await claimExpiredUploads(database, now);
    lastBatchSize = uploads.length;
    if (uploads.length === 0) break;
    batches += 1;
    claimed += uploads.length;

    const successfulIds: number[] = [];
    for (
      let offset = 0;
      offset < uploads.length;
      offset += STORAGE_CONCURRENCY
    ) {
      const group = uploads.slice(offset, offset + STORAGE_CONCURRENCY);
      const results = await Promise.allSettled(
        group.map((upload) =>
          storage.discardMultipart(upload.objectKey, upload.multipartUploadId),
        ),
      );
      results.forEach((result, index) => {
        const upload = group[index];
        if (!upload) return;
        if (result.status === "fulfilled") successfulIds.push(upload.id);
        else failed += 1;
      });
    }
    expired += await markExpired(database, successfulIds, now);
    if (uploads.length < BATCH_SIZE) break;
  }

  return {
    claimed,
    expired,
    failed,
    hasMore: batches === MAX_BATCHES && lastBatchSize === BATCH_SIZE,
  };
}

export const UPLOAD_CLEANUP_EVERY_MS = SCHEDULE_EVERY_MS;
