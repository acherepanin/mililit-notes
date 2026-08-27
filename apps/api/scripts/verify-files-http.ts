import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  attachmentUploads,
  attachments,
  createDatabase,
  createDatabasePool,
  users,
} from "@notes/db";
import { and, eq, like } from "drizzle-orm";
import { unzipSync } from "fflate";

const apiUrl = process.env.API_URL ?? "http://localhost:3201";
const mailUrl = process.env.MAIL_URL ?? "http://localhost:18025";
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3200";
const databaseUrl = process.env.DATABASE_URL;
const storageEndpoint =
  process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:19000";
const storageBucket = process.env.OBJECT_STORAGE_BUCKET ?? "notes-v2";
const storageAccessKey =
  process.env.OBJECT_STORAGE_ACCESS_KEY ?? "notes_v2_local";
const storageSecretKey =
  process.env.OBJECT_STORAGE_SECRET_KEY ?? "notes_v2_local_password";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for disposable-user cleanup");
}
const cleanupDatabaseUrl = databaseUrl;

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

interface MailList {
  messages: MailSummary[];
}

interface MailMessage {
  HTML: string;
  Text: string;
}

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
}

interface Note {
  id: number;
  name: string;
}

interface FileUpload {
  fileName: string;
  id: number;
  partCount: number;
  partSizeBytes: number;
  sizeBytes: number;
  status: string;
  uploadedParts: { etag: string; partNumber: number; sizeBytes: number }[];
}

interface FileItem {
  checksumSha256: string;
  detectedMimeType: string | null;
  duplicateOfIds: number[];
  fileName: string;
  folderId: number | null;
  id: number;
  mimeType: string;
  noteId: number | null;
  noteName: string | null;
  sizeBytes: number;
}

class Session {
  private readonly cookies = new Map<string, string>();

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method?.toUpperCase() ?? "GET";
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      );
    }
    if (method !== "GET" && method !== "HEAD") headers.set("origin", origin);
    if (init.body !== undefined)
      headers.set("content-type", "application/json");

    const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      if (!pair) continue;
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
}

async function json<T>(response: Response, expected = 200): Promise<T> {
  const body = await response.text();
  assert.equal(response.status, expected, body);
  return body ? (JSON.parse(body) as T) : (undefined as T);
}

async function pollVerificationLink(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const list = (await fetch(`${mailUrl}/api/v1/messages`).then((response) =>
      response.json(),
    )) as MailList;
    const summary = list.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `${mailUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`,
      ).then((response) => response.json())) as MailMessage;
      const links =
        `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s<>"']+/g) ??
        [];
      const link = links
        .map((value) => value.replaceAll("&amp;", "&"))
        .find((value) => value.includes("/api/auth/verify-email"));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Verification email did not arrive in Mailpit");
}

async function createVerifiedSession(label: string) {
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const username = `phase6_${label}_${suffix}`;
  const email = `${username}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const session = new Session();

  await json(
    await session.request("/api/auth/sign-up/email", {
      body: JSON.stringify({
        email,
        name: `Phase 6 ${label}`,
        password,
        username,
      }),
      method: "POST",
    }),
  );
  const verificationLink = await pollVerificationLink(email);
  const verification = await fetch(verificationLink, { redirect: "manual" });
  assert.ok([200, 302].includes(verification.status));
  await json(
    await session.request("/api/auth/sign-in/username", {
      body: JSON.stringify({ password, username }),
      method: "POST",
    }),
  );

  return { session, username };
}

async function grantFiles(
  pool: ReturnType<typeof createDatabasePool>,
  userId: number,
  limit: number,
) {
  const slug = `phase6-files-${limit}`;
  const plan = await pool.query<{ id: number }>(
    `insert into subscription_plans
       (slug, name, description, price_cents, entitlements, is_active, is_hidden, sort_order)
     values ($1, $2, $3, 0, $4::jsonb, true, true, 9000)
     on conflict (slug) do update
       set entitlements = excluded.entitlements, updated_at = now()
     returning id`,
    [
      slug,
      `Phase 6 Files ${limit}`,
      "Disposable HTTP acceptance plan",
      JSON.stringify({ files: { enabled: true, storageLimitBytes: limit } }),
    ],
  );
  const planId = plan.rows[0]?.id;
  assert.ok(planId);
  await pool.query(
    `insert into user_subscriptions
       (user_id, plan_id, status, started_at, source)
     values ($1, $2, 'active', now(), 'phase6-http')
     on conflict do nothing`,
    [userId, planId],
  );
}

function checksum(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function uploadTextFile(
  session: Session,
  input: {
    content: Uint8Array;
    fileName: string;
    folderId: number | null;
    noteId: number | null;
  },
): Promise<FileItem> {
  const expectedChecksum = checksum(input.content);
  const upload = await json<FileUpload>(
    await session.request("/api/files/uploads", {
      body: JSON.stringify({
        checksumSha256: expectedChecksum,
        fileName: input.fileName,
        folderId: input.folderId,
        mimeType: "text/plain",
        noteId: input.noteId,
        sizeBytes: input.content.byteLength,
      }),
      method: "POST",
    }),
    201,
  );
  assert.equal(upload.partCount, 1);
  const signed = await json<{ url: string }>(
    await session.request(`/api/files/uploads/${upload.id}/parts/1/url`, {
      method: "POST",
    }),
    201,
  );
  const uploadBody = input.content.buffer.slice(
    input.content.byteOffset,
    input.content.byteOffset + input.content.byteLength,
  ) as ArrayBuffer;
  const put = await fetch(signed.url, {
    body: new Blob([uploadBody]),
    method: "PUT",
  });
  assert.ok(put.ok, await put.text());
  const etag = put.headers.get("etag");
  assert.ok(etag);
  const resumed = await json<FileUpload>(
    await session.request(`/api/files/uploads/${upload.id}`),
  );
  assert.equal(resumed.uploadedParts.length, 1);
  assert.equal(resumed.uploadedParts[0]?.sizeBytes, input.content.byteLength);
  const file = await json<FileItem>(
    await session.request(`/api/files/uploads/${upload.id}/complete`, {
      body: JSON.stringify({ parts: [{ etag, partNumber: 1 }] }),
      method: "POST",
    }),
    201,
  );
  assert.equal(file.checksumSha256, expectedChecksum);
  assert.equal(file.fileName, input.fileName);
  assert.equal(file.folderId, input.folderId);
  assert.equal(file.noteId, input.noteId);
  assert.equal(file.sizeBytes, input.content.byteLength);
  return file;
}

async function cleanupDisposableData(
  pool: ReturnType<typeof createDatabasePool>,
  database: ReturnType<typeof createDatabase>,
  s3: S3Client,
) {
  const previousFiles = await database
    .select({ objectKey: attachments.objectKey })
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.userId))
    .where(like(users.username, "phase6_%"));
  const previousUploads = await database
    .select({ objectKey: attachmentUploads.objectKey })
    .from(attachmentUploads)
    .innerJoin(users, eq(users.id, attachmentUploads.userId))
    .where(like(users.username, "phase6_%"));
  for (const row of [...previousFiles, ...previousUploads]) {
    if (!row.objectKey) continue;
    await s3
      .send(
        new DeleteObjectCommand({ Bucket: storageBucket, Key: row.objectKey }),
      )
      .catch(() => undefined);
  }
  await database.delete(users).where(like(users.username, "phase6_%"));
  await pool.query(
    "delete from subscription_plans where slug like 'phase6-files-%'",
  );
}

async function run(): Promise<void> {
  const pool = createDatabasePool(cleanupDatabaseUrl, { max: 4 });
  const database = createDatabase(pool);
  const s3 = new S3Client({
    credentials: {
      accessKeyId: storageAccessKey,
      secretAccessKey: storageSecretKey,
    },
    endpoint: storageEndpoint,
    forcePathStyle: true,
    region: process.env.OBJECT_STORAGE_REGION?.trim() || "us-east-1",
  });

  try {
    await cleanupDisposableData(pool, database, s3);

    const owner = await createVerifiedSession("owner");
    const outsider = await createVerifiedSession("outsider");
    const quota = await createVerifiedSession("quota");
    const ownerRow = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, owner.username))
      .limit(1);
    const outsiderRow = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, outsider.username))
      .limit(1);
    const quotaRow = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, quota.username))
      .limit(1);
    assert.ok(ownerRow[0]);
    assert.ok(outsiderRow[0]);
    assert.ok(quotaRow[0]);
    await grantFiles(pool, ownerRow[0].id, 20 * 1024 * 1024);
    await grantFiles(pool, outsiderRow[0].id, 20 * 1024 * 1024);
    await grantFiles(pool, quotaRow[0].id, 100);

    const note = await json<Note>(
      await owner.session.request("/api/notes", {
        body: JSON.stringify({ name: "Phase 6 file notebook", parentId: null }),
        method: "POST",
      }),
      201,
    );
    const root = await json<Folder>(
      await owner.session.request("/api/files/folders", {
        body: JSON.stringify({ name: "Phase 6 root", parentId: null }),
        method: "POST",
      }),
      201,
    );
    const child = await json<Folder>(
      await owner.session.request("/api/files/folders", {
        body: JSON.stringify({ name: "Phase 6 child", parentId: root.id }),
        method: "POST",
      }),
      201,
    );
    await json(
      await owner.session.request(`/api/files/folders/${root.id}/move`, {
        body: JSON.stringify({ parentId: child.id }),
        method: "PATCH",
      }),
      400,
    );
    const renamed = await json<Folder>(
      await owner.session.request(`/api/files/folders/${child.id}`, {
        body: JSON.stringify({ name: "Phase 6 renamed" }),
        method: "PATCH",
      }),
    );
    assert.equal(renamed.name, "Phase 6 renamed");

    const quotaContent = new TextEncoder().encode("x".repeat(80));
    const quotaResponses = await Promise.all([
      quota.session.request("/api/files/uploads", {
        body: JSON.stringify({
          checksumSha256: checksum(quotaContent),
          fileName: "quota-a.txt",
          folderId: null,
          mimeType: "text/plain",
          noteId: null,
          sizeBytes: quotaContent.byteLength,
        }),
        method: "POST",
      }),
      quota.session.request("/api/files/uploads", {
        body: JSON.stringify({
          checksumSha256: checksum(quotaContent),
          fileName: "quota-b.txt",
          folderId: null,
          mimeType: "text/plain",
          noteId: null,
          sizeBytes: quotaContent.byteLength,
        }),
        method: "POST",
      }),
    ]);
    const quotaStatuses = quotaResponses
      .map((response) => response.status)
      .sort();
    assert.deepEqual(quotaStatuses, [201, 413]);
    const successfulQuota = quotaResponses.find(
      (response) => response.status === 201,
    );
    assert.ok(successfulQuota);
    const quotaUpload = (await successfulQuota.json()) as FileUpload;
    await json(
      await quota.session.request(`/api/files/uploads/${quotaUpload.id}`, {
        method: "DELETE",
      }),
    );

    const content = new TextEncoder().encode(
      `Phase 6 signed multipart payload ${randomUUID()}`,
    );
    const file = await uploadTextFile(owner.session, {
      content,
      fileName: "phase6.txt",
      folderId: root.id,
      noteId: note.id,
    });
    await json(
      await outsider.session.request(`/api/files/${file.id}/url`),
      404,
    );

    const [storedFile] = await database
      .select({
        checksumSha256: attachments.checksumSha256,
        objectKey: attachments.objectKey,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.id, file.id),
          eq(attachments.userId, ownerRow[0].id),
        ),
      )
      .limit(1);
    assert.ok(storedFile?.objectKey);
    assert.equal(storedFile.checksumSha256, file.checksumSha256);
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: storageBucket,
        Key: storedFile.objectKey,
      }),
    );
    assert.equal(head.Metadata?.sha256, file.checksumSha256);

    const signed = await json<{ url: string }>(
      await owner.session.request(`/api/files/${file.id}/url`),
    );
    const downloaded = new Uint8Array(
      await (await fetch(signed.url)).arrayBuffer(),
    );
    assert.equal(checksum(downloaded), file.checksumSha256);

    const unlinked = await json<FileItem>(
      await owner.session.request(`/api/files/${file.id}`, {
        body: JSON.stringify({ noteId: null }),
        method: "PATCH",
      }),
    );
    assert.equal(unlinked.noteId, null);
    const rebound = await json<FileItem>(
      await owner.session.request(`/api/files/${file.id}`, {
        body: JSON.stringify({ noteId: note.id }),
        method: "PATCH",
      }),
    );
    assert.equal(rebound.noteId, note.id);
    assert.equal(rebound.noteName, note.name);

    const duplicate = await json<FileItem>(
      await owner.session.request(`/api/files/${file.id}/duplicate`, {
        body: JSON.stringify({ folderId: root.id }),
        method: "POST",
      }),
      201,
    );
    assert.equal(duplicate.checksumSha256, file.checksumSha256);
    assert.ok(duplicate.duplicateOfIds.includes(file.id));
    const [duplicateRow] = await database
      .select({ objectKey: attachments.objectKey })
      .from(attachments)
      .where(eq(attachments.id, duplicate.id))
      .limit(1);
    assert.ok(duplicateRow?.objectKey);
    const duplicateHead = await s3.send(
      new HeadObjectCommand({
        Bucket: storageBucket,
        Key: duplicateRow.objectKey,
      }),
    );
    assert.equal(duplicateHead.Metadata?.sha256, file.checksumSha256);

    const nestedContent = new TextEncoder().encode(
      `Nested archive payload ${randomUUID()}`,
    );
    const nested = await uploadTextFile(owner.session, {
      content: nestedContent,
      fileName: "nested.txt",
      folderId: child.id,
      noteId: note.id,
    });

    const folderArchiveResponse = await owner.session.request(
      `/api/files/archive?folderIds=${root.id}`,
    );
    assert.equal(folderArchiveResponse.status, 200);
    assert.match(
      folderArchiveResponse.headers.get("content-type") ?? "",
      /^application\/zip/,
    );
    assert.match(
      folderArchiveResponse.headers.get("content-disposition") ?? "",
      /filename\*=UTF-8''/,
    );
    const folderArchive = unzipSync(
      new Uint8Array(await folderArchiveResponse.arrayBuffer()),
    );
    assert.deepEqual(folderArchive["Phase 6 root/phase6.txt"], content);
    assert.deepEqual(
      folderArchive["Phase 6 root/Phase 6 renamed/nested.txt"],
      nestedContent,
    );

    const noteArchiveResponse = await owner.session.request(
      `/api/files/archive?noteId=${note.id}&ids=${file.id},${nested.id}`,
    );
    assert.equal(noteArchiveResponse.status, 200);
    const noteArchive = unzipSync(
      new Uint8Array(await noteArchiveResponse.arrayBuffer()),
    );
    assert.deepEqual(noteArchive["phase6.txt"], content);
    assert.deepEqual(noteArchive["nested.txt"], nestedContent);

    await json(
      await outsider.session.request(`/api/files/archive?ids=${file.id}`),
      404,
    );
    await json(
      await outsider.session.request(`/api/files/archive?folderIds=${root.id}`),
      404,
    );
    await json(await owner.session.request("/api/files/archive?ids=1,1"), 400);
    await json(
      await owner.session.request(
        `/api/files/archive?noteId=${note.id}&folderIds=${root.id}`,
      ),
      400,
    );
    await json(await owner.session.request("/api/files/archive"), 400);

    await database
      .update(attachments)
      .set({ sizeBytes: 1024 ** 3 + 1 })
      .where(eq(attachments.id, file.id));
    await json(
      await owner.session.request(`/api/files/archive?ids=${file.id}`),
      413,
    );
    await database
      .update(attachments)
      .set({ sizeBytes: content.byteLength })
      .where(eq(attachments.id, file.id));

    const abortUpload = await json<FileUpload>(
      await owner.session.request("/api/files/uploads", {
        body: JSON.stringify({
          checksumSha256: checksum(content),
          fileName: "abort-me.txt",
          folderId: root.id,
          mimeType: "text/plain",
          noteId: null,
          sizeBytes: content.byteLength,
        }),
        method: "POST",
      }),
      201,
    );
    await json(
      await owner.session.request(`/api/files/uploads/${abortUpload.id}`, {
        method: "DELETE",
      }),
    );
    const aborted = await json<FileUpload>(
      await owner.session.request(`/api/files/uploads/${abortUpload.id}`),
    );
    assert.equal(aborted.status, "aborted");

    const rootFiles = await json<FileItem[]>(
      await owner.session.request(`/api/files?folderId=${root.id}`),
    );
    assert.ok(rootFiles.some((item) => item.id === file.id));
    assert.ok(rootFiles.some((item) => item.id === duplicate.id));
    const noteFiles = await json<FileItem[]>(
      await owner.session.request(`/api/files?noteId=${note.id}`),
    );
    assert.ok(noteFiles.some((item) => item.id === file.id));

    await json(
      await owner.session.request(`/api/files/${duplicate.id}`, {
        method: "DELETE",
      }),
    );
    await json(
      await owner.session.request(`/api/files/${file.id}`, {
        method: "DELETE",
      }),
    );
    await json(
      await owner.session.request(`/api/files/folders/${root.id}`, {
        method: "DELETE",
      }),
    );

    const remainingFiles = await database
      .select({ id: attachments.id })
      .from(attachments)
      .innerJoin(users, eq(users.id, attachments.userId))
      .where(like(users.username, "phase6_%"));
    assert.equal(remainingFiles.length, 0);

    console.log("File HTTP verification passed");
  } finally {
    await cleanupDisposableData(pool, database, s3);
    s3.destroy();
    await pool.end();
  }
}

await run();
