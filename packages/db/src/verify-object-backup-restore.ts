import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

interface BackupEntry {
  contentType: string | null;
  file: string;
  key: string;
  metadata: Record<string, string>;
  sha256: string;
  size: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key) throw new Error("object storage returned an empty key");
      keys.push(object.Key);
    }
    token = page.NextContinuationToken;
  } while (token);
  return keys.sort();
}

async function download(
  client: S3Client,
  bucket: string,
  key: string,
  file: string,
): Promise<BackupEntry> {
  const object = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!object.Body) throw new Error(`object ${key} has an empty body`);
  const handle = await open(file, "w");
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const raw of object.Body as AsyncIterable<Uint8Array>) {
      const chunk = Buffer.from(raw);
      hash.update(chunk);
      size += chunk.length;
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  assert.equal(size, object.ContentLength);
  return {
    contentType: object.ContentType ?? null,
    file,
    key,
    metadata: object.Metadata ?? {},
    sha256: hash.digest("hex"),
    size,
  };
}

async function removeBucket(client: S3Client, bucket: string): Promise<void> {
  const keys = await listKeys(client, bucket).catch(() => []);
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.slice(offset, offset + 1000).map((Key) => ({ Key })),
        },
      }),
    );
  }
  await client
    .send(new DeleteBucketCommand({ Bucket: bucket }))
    .catch(() => undefined);
}

const sourceBucket = process.env.OBJECT_STORAGE_BUCKET?.trim() || "notes-v2";
const client = new S3Client({
  credentials: {
    accessKeyId:
      process.env.OBJECT_STORAGE_ACCESS_KEY?.trim() ||
      process.env.MINIO_ROOT_USER?.trim() ||
      "notes_v2_local",
    secretAccessKey:
      process.env.OBJECT_STORAGE_SECRET_KEY?.trim() ||
      process.env.MINIO_ROOT_PASSWORD?.trim() ||
      "notes_v2_local_password",
  },
  endpoint: required("OBJECT_STORAGE_ENDPOINT"),
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== "false",
  region: process.env.OBJECT_STORAGE_REGION?.trim() || "us-east-1",
});
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const restoreBucket = `notes-restore-${suffix}`;
const backupDirectory = await mkdtemp(join(tmpdir(), "notes-object-backup-"));
let probeKey: string | undefined;
let restoreCreated = false;

try {
  let sourceKeys = await listKeys(client, sourceBucket);
  if (sourceKeys.length === 0) {
    probeKey = `_phase10-probes/${suffix}`;
    const body = Buffer.from(`notes-object-backup-probe:${suffix}`);
    await client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: sourceBucket,
        Key: probeKey,
        Metadata: { sha256: createHash("sha256").update(body).digest("hex") },
      }),
    );
    sourceKeys = [probeKey];
  }

  const entries: BackupEntry[] = [];
  for (const [index, key] of sourceKeys.entries()) {
    entries.push(
      await download(
        client,
        sourceBucket,
        key,
        join(backupDirectory, String(index).padStart(8, "0")),
      ),
    );
  }
  const manifestPath = join(backupDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(entries, null, 2), "utf8");
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as BackupEntry[];

  await client.send(new CreateBucketCommand({ Bucket: restoreBucket }));
  restoreCreated = true;
  for (const entry of manifest) {
    await new Upload({
      client,
      leavePartsOnError: false,
      params: {
        Body: createReadStream(entry.file),
        Bucket: restoreBucket,
        Key: entry.key,
        Metadata: entry.metadata,
        ...(entry.contentType ? { ContentType: entry.contentType } : {}),
      },
      partSize: 8 * 1024 * 1024,
      queueSize: 2,
    }).done();
  }

  assert.deepEqual(await listKeys(client, restoreBucket), sourceKeys);
  let totalBytes = 0;
  for (const [index, entry] of manifest.entries()) {
    const restored = await download(
      client,
      restoreBucket,
      entry.key,
      join(backupDirectory, `restored-${String(index).padStart(8, "0")}`),
    );
    assert.equal(restored.size, entry.size);
    assert.equal(restored.sha256, entry.sha256);
    assert.deepEqual(restored.metadata, entry.metadata);
    totalBytes += entry.size;
  }
  console.log(
    `Object backup/restore SHA-256 verification passed for ${manifest.length} object(s), ${totalBytes} byte(s)`,
  );
} finally {
  if (restoreCreated) await removeBucket(client, restoreBucket);
  if (probeKey) {
    await client
      .send(
        new DeleteObjectsCommand({
          Bucket: sourceBucket,
          Delete: { Objects: [{ Key: probeKey }] },
        }),
      )
      .catch(() => undefined);
  }
  client.destroy();
  await rm(backupDirectory, { force: true, recursive: true });
}
