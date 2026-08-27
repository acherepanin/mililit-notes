import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { fileTypeFromFile } from "file-type";

import { hashFile, resolveLegacyFile } from "./file-migration.js";
import { createDatabasePool } from "./index.js";

interface AttachmentRow {
  checksum_sha256: string | null;
  detected_mime_type: string | null;
  file_name: string;
  id: number;
  legacy_storage_path: string | null;
  mime_type: string;
  object_key: string | null;
  size_bytes: string;
  storage_status: string;
  user_id: number;
}

interface ObjectExpectation {
  checksum: string;
  key: string;
  size: number;
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function databaseUrl(): string {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) return explicit;
  const host = process.env.POSTGRES_HOST?.trim();
  if (!host) throw new Error("DATABASE_URL or POSTGRES_HOST is required");
  const user = process.env.POSTGRES_USER?.trim() || "notes_v2";
  const password =
    process.env.POSTGRES_PASSWORD?.trim() || "notes_v2_local_only";
  const database = process.env.POSTGRES_DB?.trim() || "notes_v2";
  const port = process.env.POSTGRES_INTERNAL_PORT?.trim() || "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

async function headObject(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput | null> {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    const metadata = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata;
    if (metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function hashObject(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<string> {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!object.Body) throw new Error(`object ${key} has an empty body`);
  const hash = createHash("sha256");
  for await (const raw of object.Body as AsyncIterable<Uint8Array>) {
    hash.update(Buffer.from(raw));
  }
  return hash.digest("hex");
}

async function verifyObject(
  s3: S3Client,
  bucket: string,
  expected: ObjectExpectation,
): Promise<HeadObjectCommandOutput> {
  const object = await headObject(s3, bucket, expected.key);
  if (!object) {
    throw new Error(`object ${expected.key} is missing`);
  }
  if (object.ContentLength !== expected.size) {
    throw new Error(
      `object ${expected.key} has ${object.ContentLength ?? "unknown"} bytes; expected ${expected.size}`,
    );
  }
  if (object.Metadata?.sha256 && object.Metadata.sha256 !== expected.checksum) {
    throw new Error(
      `object ${expected.key} has an unexpected SHA-256 metadata value`,
    );
  }
  if (!object.Metadata?.sha256) {
    const checksum = await hashObject(s3, bucket, expected.key);
    if (checksum !== expected.checksum) {
      throw new Error(`object ${expected.key} has an unexpected SHA-256 value`);
    }
  }
  return object;
}

const verifyOnly = process.argv.includes("--verify-only");
const connectionString = databaseUrl();
const endpoint = requireEnvironment("OBJECT_STORAGE_ENDPOINT");
const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim() || "notes-v2";
const accessKeyId =
  process.env.OBJECT_STORAGE_ACCESS_KEY?.trim() ||
  process.env.MINIO_ROOT_USER?.trim() ||
  "notes_v2_local";
const secretAccessKey =
  process.env.OBJECT_STORAGE_SECRET_KEY?.trim() ||
  process.env.MINIO_ROOT_PASSWORD?.trim() ||
  "notes_v2_local_password";
const region = process.env.OBJECT_STORAGE_REGION?.trim() || "us-east-1";
const root = process.env.LEGACY_UPLOADS_ROOT?.trim();
const pool = createDatabasePool(connectionString, { max: 2 });
const s3 = new S3Client({
  credentials: { accessKeyId, secretAccessKey },
  endpoint,
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== "false",
  region,
});

async function listObjectKeys(): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key) throw new Error("object storage returned an empty key");
      keys.push(object.Key);
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

try {
  const result = await pool.query<AttachmentRow>(
    `select id, user_id, file_name, mime_type, size_bytes::text,
            legacy_storage_path, object_key, checksum_sha256,
            detected_mime_type, storage_status
       from attachments
      order by id`,
  );
  const expectedKeys = new Set<string>();

  for (const attachment of result.rows) {
    const size = Number(attachment.size_bytes);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`attachment ${attachment.id} has an invalid size`);
    }

    if (attachment.storage_status === "ready") {
      if (!attachment.object_key || !attachment.checksum_sha256) {
        throw new Error(
          `attachment ${attachment.id} is ready without object metadata`,
        );
      }
      expectedKeys.add(attachment.object_key);
      await verifyObject(s3, bucket, {
        checksum: attachment.checksum_sha256,
        key: attachment.object_key,
        size,
      });
      console.log(`attachment ${attachment.id}: verified`);
      continue;
    }

    if (verifyOnly) {
      throw new Error(
        `attachment ${attachment.id} has incomplete storage status ${attachment.storage_status}`,
      );
    }
    if (!root) {
      throw new Error(
        "LEGACY_UPLOADS_ROOT is required while files remain pending",
      );
    }
    if (!attachment.legacy_storage_path) {
      throw new Error(`attachment ${attachment.id} has no legacy storage path`);
    }

    try {
      const path = await resolveLegacyFile(
        root,
        attachment.legacy_storage_path,
      );
      const fileStat = await stat(path);
      if (!fileStat.isFile()) {
        throw new Error("legacy path is not a regular file");
      }
      if (fileStat.size !== size) {
        throw new Error(
          `legacy file has ${fileStat.size} bytes; expected ${size}`,
        );
      }

      const checksum = await hashFile(path);
      const key = `users/${attachment.user_id}/attachments/${attachment.id}/${checksum}`;
      const detectedMimeType =
        (await fileTypeFromFile(path))?.mime || attachment.mime_type;
      const expected = { checksum, key, size };
      const existing = await headObject(s3, bucket, key);

      await pool.query(
        `update attachments
            set storage_status = 'copying', updated_at = now()
          where id = $1`,
        [attachment.id],
      );

      let etag = existing?.ETag;
      if (existing) {
        await verifyObject(s3, bucket, expected);
      } else {
        const upload = new Upload({
          client: s3,
          leavePartsOnError: false,
          params: {
            Body: createReadStream(path),
            Bucket: bucket,
            ContentType: detectedMimeType,
            Key: key,
            Metadata: {
              attachmentid: String(attachment.id),
              sha256: checksum,
            },
          },
          partSize: 8 * 1024 * 1024,
          queueSize: 2,
        });
        const uploaded = await upload.done();
        etag = uploaded.ETag;
        await verifyObject(s3, bucket, expected);
      }

      await pool.query(
        `update attachments
            set object_key = $2,
                checksum_sha256 = $3,
                detected_mime_type = $4,
                etag = $5,
                storage_status = 'ready',
                updated_at = now()
          where id = $1`,
        [attachment.id, key, checksum, detectedMimeType, etag ?? null],
      );
      console.log(`attachment ${attachment.id}: migrated and verified`);
    } catch (error) {
      await pool.query(
        `update attachments
            set storage_status = 'failed', updated_at = now()
          where id = $1`,
        [attachment.id],
      );
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`attachment ${attachment.id}: ${message}`, {
        cause: error,
      });
    }
  }

  const orphanKeys = (await listObjectKeys()).filter(
    (key) => !expectedKeys.has(key),
  );
  if (orphanKeys.length > 0) {
    throw new Error(
      `object storage contains ${orphanKeys.length} object(s) without a ready attachment`,
    );
  }

  console.log(
    `File verification passed for ${result.rowCount ?? 0} attachment(s)`,
  );
} finally {
  s3.destroy();
  await pool.end();
}
