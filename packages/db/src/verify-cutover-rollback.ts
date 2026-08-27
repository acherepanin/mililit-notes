import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, request as createRequest, type Server } from "node:http";
import { promisify } from "node:util";

import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Pool } from "pg";

import { createDatabasePool } from "./index.js";

const run = promisify(execFile);
process.loadEnvFile("infra/compose/.env");

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const sourceDatabase = process.env.POSTGRES_DB?.trim() || "notes_v2";
const databaseUser = process.env.POSTGRES_USER?.trim() || "notes_v2";
const databasePassword =
  process.env.POSTGRES_PASSWORD?.trim() || "notes_v2_local_only";
const databasePort = process.env.POSTGRES_PORT?.trim() || "55432";
const databaseContainer =
  process.env.POSTGRES_CONTAINER?.trim() || "notes-v2-postgres-1";
const cloneDatabase = `notes_v2_cutover_${suffix}`;
const dumpPath = `/tmp/notes-v2-cutover-${suffix}.dump`;
const cloneBucket = `notes-cutover-${suffix}`;
const sourceBucket = process.env.OBJECT_STORAGE_BUCKET?.trim() || "notes-v2";
const proxyPort = Number(process.env.CUTOVER_PROXY_PORT ?? 3210);
const apiPort = Number(process.env.CUTOVER_API_PORT ?? 3211);
const workerPort = Number(process.env.CUTOVER_WORKER_PORT ?? 3212);
const proxyOrigin = `http://localhost:${proxyPort}`;
const mailUrl = "http://localhost:18025";

interface MailSummary {
  ID: string;
  To: { Address: string }[];
}

interface MailList {
  messages: MailSummary[];
}

function safeIdentifier(value: string, field: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${field} is not a safe identifier`);
  }
  return value;
}

function databaseUrl(database: string): string {
  return `postgresql://${encodeURIComponent(databaseUser)}:${encodeURIComponent(databasePassword)}@127.0.0.1:${databasePort}/${encodeURIComponent(database)}`;
}

async function dockerExec(...args: string[]): Promise<string> {
  const result = await run("docker", ["exec", databaseContainer, ...args], {
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
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

function startService(
  entrypoint: string,
  environment: NodeJS.ProcessEnv,
): { logs: string[]; process: ChildProcess } {
  const logs: string[] = [];
  const child = spawn(process.execPath, [entrypoint], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const capture = (value: Buffer): void => {
    logs.push(value.toString("utf8").trim());
    if (logs.length > 30) logs.shift();
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  return { logs, process: child };
}

async function stopService(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForHealth(
  url: string,
  service: { logs: string[]; process: ChildProcess },
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (service.process.exitCode !== null) {
      throw new Error(
        `service exited with ${service.process.exitCode}: ${service.logs.join("\n")}`,
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Service startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`service health timed out: ${service.logs.join("\n")}`);
}

function createProxy(initialPort: number): {
  close(): Promise<void>;
  listen(): Promise<void>;
  route(port: number): void;
} {
  let targetPort = initialPort;
  const server: Server = createServer((incoming, outgoing) => {
    const upstream = createRequest(
      {
        headers: incoming.headers,
        hostname: "127.0.0.1",
        method: incoming.method,
        path: incoming.url,
        port: targetPort,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", (error) => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end(error.message);
    });
    incoming.pipe(upstream);
  });
  return {
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(proxyPort, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      }),
    route: (port) => {
      targetPort = port;
    },
  };
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
    if (method !== "GET" && method !== "HEAD")
      headers.set("origin", proxyOrigin);
    if (init.body !== undefined)
      headers.set("content-type", "application/json");
    const response = await fetch(`${proxyOrigin}${path}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair?.indexOf("=") ?? -1;
      if (!pair || separator < 1) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
}

async function expectStatus(
  response: Response,
  status: number,
): Promise<unknown> {
  const body = await response.text();
  assert.equal(response.status, status, body);
  return body ? JSON.parse(body) : undefined;
}

async function mailIds(): Promise<Set<string>> {
  const list = (await fetch(`${mailUrl}/api/v1/messages`).then((response) =>
    response.json(),
  )) as MailList;
  return new Set(list.messages.map(({ ID }) => ID));
}

async function verificationLink(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
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
      ).then((response) => response.json())) as { HTML: string; Text: string };
      const link = (
        `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s<>"']+/g) ?? []
      )
        .map((value) => value.replaceAll("&amp;", "&"))
        .find((value) => value.includes("/api/auth/verify-email"));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("cutover verification email did not arrive");
}

async function rowCount(pool: Pool, table: "notes" | "users"): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from "${table}"`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

safeIdentifier(sourceDatabase, "POSTGRES_DB");
safeIdentifier(databaseUser, "POSTGRES_USER");
safeIdentifier(cloneDatabase, "clone database");
assert.ok(Number.isInteger(proxyPort) && proxyPort > 0);
assert.ok(Number.isInteger(apiPort) && apiPort > 0);
assert.ok(Number.isInteger(workerPort) && workerPort > 0);

const sourceUrl = databaseUrl(sourceDatabase);
const cloneUrl = databaseUrl(cloneDatabase);
const storage = new S3Client({
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER?.trim() || "notes_v2_local",
    secretAccessKey:
      process.env.MINIO_ROOT_PASSWORD?.trim() || "notes_v2_local_password",
  },
  endpoint: "http://127.0.0.1:19000",
  forcePathStyle: true,
  region: "us-east-1",
});
const proxy = createProxy(3201);
let api: ChildProcess | null = null;
let worker: ChildProcess | null = null;
let clonePool: Pool | null = null;
let cloneCreated = false;
let bucketCreated = false;
let proxyListening = false;
let initialMailIds = new Set<string>();

try {
  initialMailIds = await mailIds();
  await run(
    "docker",
    ["exec", "notes-v2-redis-1", "redis-cli", "-n", "15", "flushdb"],
    { windowsHide: true },
  );
  await dockerExec(
    "pg_dump",
    "-U",
    databaseUser,
    "-d",
    sourceDatabase,
    "--format=custom",
    "--file",
    dumpPath,
  );
  await dockerExec("createdb", "-U", databaseUser, cloneDatabase);
  cloneCreated = true;
  await dockerExec(
    "pg_restore",
    "-U",
    databaseUser,
    "-d",
    cloneDatabase,
    "--exit-on-error",
    "--no-owner",
    "--no-privileges",
    dumpPath,
  );

  await storage.send(new CreateBucketCommand({ Bucket: cloneBucket }));
  bucketCreated = true;
  const sourceKeys = await listKeys(storage, sourceBucket);
  for (const key of sourceKeys) {
    await storage.send(
      new CopyObjectCommand({
        Bucket: cloneBucket,
        CopySource: encodeURIComponent(`${sourceBucket}/${key}`).replaceAll(
          "%2F",
          "/",
        ),
        Key: key,
      }),
    );
  }
  assert.deepEqual(await listKeys(storage, cloneBucket), sourceKeys);

  clonePool = createDatabasePool(cloneUrl, { max: 2 });
  const sourcePool = createDatabasePool(sourceUrl, { max: 2 });
  const baseline = {
    notes: await rowCount(clonePool, "notes"),
    users: await rowCount(clonePool, "users"),
  };
  try {
    assert.deepEqual(
      baseline,
      {
        notes: await rowCount(sourcePool, "notes"),
        users: await rowCount(sourcePool, "users"),
      },
      "production-like clone does not match its source",
    );
  } finally {
    await sourcePool.end();
  }

  await proxy.listen();
  proxyListening = true;
  assert.equal((await fetch(`${proxyOrigin}/api/health`)).status, 200);

  const sharedEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: cloneUrl,
    HOST: "127.0.0.1",
    INTERNAL_INTEGRATION_SECRET: process.env.INTERNAL_INTEGRATION_SECRET,
    NODE_ENV: "production",
    OBJECT_STORAGE_ACCESS_KEY:
      process.env.MINIO_ROOT_USER?.trim() || "notes_v2_local",
    OBJECT_STORAGE_BUCKET: cloneBucket,
    OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:19000",
    OBJECT_STORAGE_PUBLIC_ENDPOINT: "http://127.0.0.1:19000",
    OBJECT_STORAGE_SECRET_KEY:
      process.env.MINIO_ROOT_PASSWORD?.trim() || "notes_v2_local_password",
    REDIS_URL: "redis://127.0.0.1:56379/15",
  };
  const apiEnvironment: NodeJS.ProcessEnv = {
    ...sharedEnvironment,
    APP_ORIGIN: proxyOrigin,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: proxyOrigin,
    INTERNAL_WORKER_HEALTH_URL: `http://127.0.0.1:${workerPort}/ready`,
    PORT: String(apiPort),
    WEBAUTHN_ORIGIN: proxyOrigin,
    WEBAUTHN_RP_ID: "localhost",
  };
  const workerEnvironment: NodeJS.ProcessEnv = {
    ...sharedEnvironment,
    INTERNAL_INTEGRATION_URL: `http://127.0.0.1:${apiPort}/api/internal/integrations/process`,
    PORT: String(workerPort),
    SMTP_FROM: process.env.SMTP_FROM || "Notes AI <no-reply@notes.local>",
    SMTP_HOST: "127.0.0.1",
    SMTP_PASS: process.env.SMTP_PASS || "",
    SMTP_PORT: process.env.MAILPIT_SMTP_PORT?.trim() || "11025",
    SMTP_SECURE: "false",
    SMTP_USER: process.env.SMTP_USER || "",
  };

  const apiService = startService("apps/api/dist/main.js", apiEnvironment);
  api = apiService.process;
  const workerService = startService(
    "apps/worker/dist/main.js",
    workerEnvironment,
  );
  worker = workerService.process;
  await Promise.all([
    waitForHealth(`http://127.0.0.1:${apiPort}/api/health`, apiService),
    waitForHealth(`http://127.0.0.1:${workerPort}/ready`, workerService),
  ]);

  proxy.route(apiPort);
  assert.equal((await fetch(`${proxyOrigin}/api/health`)).status, 200);
  const username = `cutover_${suffix}`;
  const email = `${username}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const session = new Session();
  await expectStatus(
    await session.request("/api/auth/sign-up/email", {
      body: JSON.stringify({
        email,
        name: "Cutover rehearsal",
        password,
        username,
      }),
      method: "POST",
    }),
    200,
  );
  const verification = await fetch(await verificationLink(email), {
    redirect: "manual",
  });
  assert.ok([200, 302].includes(verification.status));
  await expectStatus(
    await session.request("/api/auth/sign-in/username", {
      body: JSON.stringify({ password, username }),
      method: "POST",
    }),
    200,
  );
  await expectStatus(
    await session.request("/api/notes", {
      body: JSON.stringify({
        name: "Cutover writable-state probe",
        parentId: null,
      }),
      method: "POST",
    }),
    201,
  );
  assert.equal(await rowCount(clonePool, "users"), baseline.users + 1);
  assert.equal(await rowCount(clonePool, "notes"), baseline.notes + 1);

  proxy.route(3201);
  assert.equal((await fetch(`${proxyOrigin}/api/health`)).status, 200);
  await stopService(worker);
  worker = null;
  await stopService(api);
  api = null;
  await clonePool.end();
  clonePool = null;

  await dockerExec(
    "dropdb",
    "-U",
    databaseUser,
    "--if-exists",
    "--force",
    cloneDatabase,
  );
  cloneCreated = false;
  await dockerExec("createdb", "-U", databaseUser, cloneDatabase);
  cloneCreated = true;
  await dockerExec(
    "pg_restore",
    "-U",
    databaseUser,
    "-d",
    cloneDatabase,
    "--exit-on-error",
    "--no-owner",
    "--no-privileges",
    dumpPath,
  );
  clonePool = createDatabasePool(cloneUrl, { max: 2 });
  assert.equal(await rowCount(clonePool, "users"), baseline.users);
  assert.equal(await rowCount(clonePool, "notes"), baseline.notes);
  const removed = await clonePool.query<{ count: string }>(
    "select count(*)::text as count from users where username = $1",
    [username],
  );
  assert.equal(removed.rows[0]?.count, "0");

  const restoredApi = startService("apps/api/dist/main.js", apiEnvironment);
  api = restoredApi.process;
  await waitForHealth(`http://127.0.0.1:${apiPort}/api/health`, restoredApi);
  await stopService(api);
  api = null;

  console.log(
    `Cutover/rollback verification passed: routed write restored to ${baseline.users} user(s), ${baseline.notes} note(s), ${sourceKeys.length} object(s)`,
  );
} finally {
  proxy.route(3201);
  await stopService(worker);
  await stopService(api);
  if (proxyListening) await proxy.close().catch(() => undefined);
  if (clonePool) await clonePool.end().catch(() => undefined);
  if (cloneCreated) {
    await dockerExec(
      "dropdb",
      "-U",
      databaseUser,
      "--if-exists",
      "--force",
      cloneDatabase,
    ).catch(() => undefined);
  }
  await dockerExec("rm", "-f", dumpPath).catch(() => undefined);
  await run(
    "docker",
    ["exec", "notes-v2-redis-1", "redis-cli", "-n", "15", "flushdb"],
    { windowsHide: true },
  ).catch(() => undefined);
  if (bucketCreated) await removeBucket(storage, cloneBucket);
  storage.destroy();

  const newMailIds = [
    ...(await mailIds().catch(() => new Set<string>())),
  ].filter((id) => !initialMailIds.has(id));
  if (newMailIds.length > 0) {
    await fetch(`${mailUrl}/api/v1/messages`, {
      body: JSON.stringify({ IDs: newMailIds }),
      headers: { "content-type": "application/json" },
      method: "DELETE",
    }).catch(() => undefined);
  }
}
