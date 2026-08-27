import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  ListPartsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createDatabasePool } from "@notes/db";

import { createSystemQueue } from "../src/queue.js";
import {
  cleanupExpiredUploads,
  createUploadCleanupStorage,
  UPLOAD_CLEANUP_JOB,
  UPLOAD_CLEANUP_SCHEDULER,
  type UploadCleanupStorage,
} from "../src/upload-cleanup.js";

const environment = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2",
  OBJECT_STORAGE_ACCESS_KEY:
    process.env.OBJECT_STORAGE_ACCESS_KEY ?? "notes_v2_local",
  OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET ?? "notes-v2",
  OBJECT_STORAGE_ENDPOINT:
    process.env.OBJECT_STORAGE_ENDPOINT ?? "http://127.0.0.1:19000",
  OBJECT_STORAGE_SECRET_KEY:
    process.env.OBJECT_STORAGE_SECRET_KEY ?? "notes_v2_local_password",
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:56379",
};

function isMissingMultipart(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    (("name" in error && error.name === "NoSuchUpload") ||
      ("$metadata" in error &&
        error.$metadata !== null &&
        typeof error.$metadata === "object" &&
        "httpStatusCode" in error.$metadata &&
        error.$metadata.httpStatusCode === 404))
  );
}

const database = createDatabasePool(environment.DATABASE_URL, { max: 2 });
const storage = createUploadCleanupStorage(environment);
const objectStorage = new S3Client({
  credentials: {
    accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
  },
  endpoint: environment.OBJECT_STORAGE_ENDPOINT,
  forcePathStyle: true,
  region: "us-east-1",
});
const queue = createSystemQueue(environment.REDIS_URL);
const createdUploadIds: number[] = [];
const multipartUploads: Array<{ key: string; uploadId: string }> = [];
const objectKeys: string[] = [];
let userId: number | undefined;

async function createMultipart(key: string): Promise<string> {
  const result = await objectStorage.send(
    new CreateMultipartUploadCommand({
      Bucket: environment.OBJECT_STORAGE_BUCKET,
      ContentType: "application/octet-stream",
      Key: key,
      Metadata: { managed: "notes-v2-cleanup-verification" },
    }),
  );
  assert.ok(result.UploadId, "MinIO did not return a multipart upload id");
  multipartUploads.push({ key, uploadId: result.UploadId });
  return result.UploadId;
}

async function insertUpload(input: {
  expiresAt: Date;
  key: string;
  status: string;
  updatedAt: Date;
  uploadId: string | null;
}): Promise<number> {
  assert.ok(userId);
  const result = await database.query<{ id: number }>(
    `insert into attachment_uploads (
       user_id, file_name, declared_mime_type, size_bytes, object_key,
       multipart_upload_id, part_size_bytes, status, expires_at, updated_at
     ) values ($1, $2, 'application/octet-stream', 8388608, $3, $4,
       8388608, $5, $6, $7)
     returning id`,
    [
      userId,
      `cleanup-${randomUUID()}.bin`,
      input.key,
      input.uploadId,
      input.status,
      input.expiresAt,
      input.updatedAt,
    ],
  );
  const id = result.rows[0]?.id;
  assert.ok(id);
  createdUploadIds.push(id);
  return id;
}

async function statusById(ids: number[]): Promise<Map<number, string>> {
  const result = await database.query<{ id: number; status: string }>(
    `select id, status from attachment_uploads
     where id = any($1::integer[])`,
    [ids],
  );
  return new Map(result.rows.map((row) => [row.id, row.status]));
}

async function assertMultipartMissing(
  key: string,
  uploadId: string,
): Promise<void> {
  try {
    await objectStorage.send(
      new ListPartsCommand({
        Bucket: environment.OBJECT_STORAGE_BUCKET,
        Key: key,
        UploadId: uploadId,
      }),
    );
    assert.fail(`Multipart upload for ${key} still exists`);
  } catch (error) {
    assert.ok(isMissingMultipart(error), `Unexpected S3 error for ${key}`);
  }
}

try {
  const scheduler = await queue.getJobScheduler(UPLOAD_CLEANUP_SCHEDULER);
  assert.equal(scheduler?.name, UPLOAD_CLEANUP_JOB);
  assert.equal(scheduler?.every, 15 * 60 * 1_000);

  const suffix = randomUUID();
  const created = await database.query<{ id: number }>(
    `insert into users (
       username, auth_name, auth_email, email_verified
     ) values ($1, $2, $3, true)
     returning id`,
    [
      `cleanup_${suffix}`,
      "Cleanup verification",
      `cleanup_${suffix}@notes.local`,
    ],
  );
  userId = created.rows[0]?.id;
  assert.ok(userId);

  const now = new Date();
  const expiredAt = new Date(now.getTime() - 2 * 60 * 60 * 1_000);
  const staleAt = new Date(now.getTime() - 3 * 60 * 60 * 1_000);
  const freshUntil = new Date(now.getTime() + 4 * 60 * 60 * 1_000);
  const keys = {
    completing: `users/${userId}/files/${randomUUID()}`,
    fresh: `users/${userId}/files/${randomUUID()}`,
    preparing: `users/${userId}/files/${randomUUID()}`,
    retry: `users/${userId}/files/${randomUUID()}`,
    uploading: `users/${userId}/files/${randomUUID()}`,
  };
  objectKeys.push(...Object.values(keys));

  const [
    uploadingMultipart,
    completingMultipart,
    retryMultipart,
    freshMultipart,
  ] = await Promise.all([
    createMultipart(keys.uploading),
    createMultipart(keys.completing),
    createMultipart(keys.retry),
    createMultipart(keys.fresh),
  ]);
  const preparingId = await insertUpload({
    expiresAt: expiredAt,
    key: keys.preparing,
    status: "preparing",
    updatedAt: staleAt,
    uploadId: null,
  });
  const uploadingId = await insertUpload({
    expiresAt: expiredAt,
    key: keys.uploading,
    status: "uploading",
    updatedAt: staleAt,
    uploadId: uploadingMultipart,
  });
  const completingId = await insertUpload({
    expiresAt: expiredAt,
    key: keys.completing,
    status: "completing",
    updatedAt: staleAt,
    uploadId: completingMultipart,
  });
  const retryId = await insertUpload({
    expiresAt: expiredAt,
    key: keys.retry,
    status: "expiring",
    updatedAt: staleAt,
    uploadId: retryMultipart,
  });
  const freshId = await insertUpload({
    expiresAt: freshUntil,
    key: keys.fresh,
    status: "uploading",
    updatedAt: now,
    uploadId: freshMultipart,
  });

  const unavailableStorage: UploadCleanupStorage = {
    async discardMultipart() {
      throw new Error("verification storage outage");
    },
  };
  const failed = await cleanupExpiredUploads(database, unavailableStorage, now);
  assert.equal(failed.failed, 4);
  let statuses = await statusById(createdUploadIds);
  for (const id of [preparingId, uploadingId, completingId, retryId]) {
    assert.equal(statuses.get(id), "expiring");
  }
  assert.equal(statuses.get(freshId), "uploading");

  const retryAt = new Date(now.getTime() + 16 * 60 * 1_000);
  const recovered = await cleanupExpiredUploads(database, storage, retryAt);
  assert.equal(recovered.expired, 4);
  assert.equal(recovered.failed, 0);
  statuses = await statusById(createdUploadIds);
  for (const id of [preparingId, uploadingId, completingId, retryId]) {
    assert.equal(statuses.get(id), "expired");
  }
  assert.equal(statuses.get(freshId), "uploading");

  await Promise.all([
    assertMultipartMissing(keys.uploading, uploadingMultipart),
    assertMultipartMissing(keys.completing, completingMultipart),
    assertMultipartMissing(keys.retry, retryMultipart),
  ]);
  await objectStorage.send(
    new ListPartsCommand({
      Bucket: environment.OBJECT_STORAGE_BUCKET,
      Key: keys.fresh,
      UploadId: freshMultipart,
    }),
  );

  console.log("Upload cleanup verification passed");
} finally {
  for (const multipart of multipartUploads) {
    try {
      await objectStorage.send(
        new AbortMultipartUploadCommand({
          Bucket: environment.OBJECT_STORAGE_BUCKET,
          Key: multipart.key,
          UploadId: multipart.uploadId,
        }),
      );
    } catch (error) {
      if (!isMissingMultipart(error)) {
        console.warn("Could not clean a verification multipart upload");
      }
    }
  }
  await Promise.all(
    objectKeys.map((key) =>
      objectStorage.send(
        new DeleteObjectCommand({
          Bucket: environment.OBJECT_STORAGE_BUCKET,
          Key: key,
        }),
      ),
    ),
  );
  if (createdUploadIds.length > 0) {
    await database.query(
      `delete from activity_logs
       where target_type = 'attachment_upload'
         and target_id = any($1::integer[])`,
      [createdUploadIds],
    );
  }
  if (userId) {
    await database.query("delete from users where id = $1", [userId]);
  }
  await Promise.all([database.end(), queue.close()]);
  storage.close();
  objectStorage.destroy();
}
