import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";

import Cursor from "pg-cursor";
import type { Pool, PoolClient } from "pg";

import { createDatabasePool, expectedTableNames } from "./index.js";

const run = promisify(execFile);
const sourceUrl =
  process.env.DATABASE_URL ??
  "postgresql://notes_v2:notes_v2_local_only@127.0.0.1:55432/notes_v2";
const parsedSourceUrl = new URL(sourceUrl);
const container = process.env.POSTGRES_CONTAINER ?? "notes-v2-postgres-1";
const databaseName =
  process.env.POSTGRES_DB ??
  decodeURIComponent(parsedSourceUrl.pathname.slice(1));
const databaseUser =
  process.env.POSTGRES_USER ?? decodeURIComponent(parsedSourceUrl.username);
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const restoreDatabase = `notes_v2_restore_${suffix}`;
const backupPath = `/tmp/notes-v2-backup-${suffix}.dump`;

function safeIdentifier(value: string, field: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${field} is not a safe PostgreSQL identifier`);
  }
  return value;
}

function safeContainer(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) {
    throw new Error("POSTGRES_CONTAINER is invalid");
  }
  return value;
}

async function dockerExec(...args: string[]): Promise<string> {
  const result = await run(
    "docker",
    ["exec", safeContainer(container), ...args],
    {
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );
  return result.stdout.trim();
}

function restoreUrl(): string {
  const value = new URL(sourceUrl);
  value.pathname = `/${restoreDatabase}`;
  return value.toString();
}

async function rowCounts(pool: Pool): Promise<Map<string, bigint>> {
  const counts = new Map<string, bigint>();
  for (const table of expectedTableNames) {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count from "${table}"`,
    );
    counts.set(table, BigInt(result.rows[0]?.count ?? "0"));
  }
  return counts;
}

async function primaryKeyColumns(
  client: PoolClient,
  table: string,
): Promise<string[]> {
  const result = await client.query<{ name: string }>(
    `select attribute.attname as name
       from pg_index index_definition
       join pg_attribute attribute
         on attribute.attrelid = index_definition.indrelid
        and attribute.attnum = any(index_definition.indkey)
      where index_definition.indrelid = $1::regclass
        and index_definition.indisprimary
      order by array_position(index_definition.indkey, attribute.attnum)`,
    [table],
  );
  if (result.rows.length === 0) {
    throw new Error(`table ${table} has no primary key for stable checksums`);
  }
  return result.rows.map(({ name }) => name);
}

async function tableChecksums(pool: Pool): Promise<Map<string, string>> {
  const checksums = new Map<string, string>();
  const client = await pool.connect();
  try {
    for (const table of expectedTableNames) {
      const order = (await primaryKeyColumns(client, table))
        .map((column) => `"${column.replaceAll('"', '""')}"`)
        .join(", ");
      const cursor = client.query(
        new Cursor<{ value: string }>(
          `select row_to_json(row_data)::text as value
             from (select * from "${table}" order by ${order}) row_data`,
        ),
      );
      const hash = createHash("sha256");
      try {
        while (true) {
          const rows = await cursor.read(500);
          if (rows.length === 0) break;
          for (const { value } of rows) {
            hash
              .update(String(Buffer.byteLength(value)))
              .update(":")
              .update(value);
          }
        }
      } finally {
        await cursor.close();
      }
      checksums.set(table, hash.digest("hex"));
    }
  } finally {
    client.release();
  }
  return checksums;
}

safeIdentifier(databaseName, "POSTGRES_DB");
safeIdentifier(databaseUser, "POSTGRES_USER");
safeIdentifier(restoreDatabase, "restore database");

let restorePool: Pool | null = null;
let restoreCreated = false;

try {
  await dockerExec(
    "pg_dump",
    "-U",
    databaseUser,
    "-d",
    databaseName,
    "--format=custom",
    "--file",
    backupPath,
  );
  const backupBytes = Number(await dockerExec("stat", "-c", "%s", backupPath));
  assert.ok(Number.isSafeInteger(backupBytes) && backupBytes > 0);

  await dockerExec("createdb", "-U", databaseUser, restoreDatabase);
  restoreCreated = true;
  await dockerExec(
    "pg_restore",
    "-U",
    databaseUser,
    "-d",
    restoreDatabase,
    "--exit-on-error",
    "--no-owner",
    "--no-privileges",
    backupPath,
  );

  const restoredUrl = restoreUrl();
  restorePool = createDatabasePool(restoredUrl, { max: 2 });
  const sourcePool = createDatabasePool(sourceUrl, { max: 2 });
  try {
    const [sourceCounts, restoredCounts, sourceChecksums, restoredChecksums] =
      await Promise.all([
        rowCounts(sourcePool),
        rowCounts(restorePool),
        tableChecksums(sourcePool),
        tableChecksums(restorePool),
      ]);
    assert.deepEqual(restoredCounts, sourceCounts);
    assert.deepEqual(restoredChecksums, sourceChecksums);
  } finally {
    await sourcePool.end();
  }

  await restorePool.end();
  restorePool = null;
  await run(process.execPath, ["dist/verify.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: restoredUrl },
    windowsHide: true,
  });

  console.log(
    `Backup/restore count and SHA-256 verification passed for ${expectedTableNames.length} tables`,
  );
} finally {
  if (restorePool) await restorePool.end().catch(() => undefined);
  if (restoreCreated) {
    await dockerExec(
      "dropdb",
      "-U",
      databaseUser,
      "--if-exists",
      "--force",
      restoreDatabase,
    ).catch(() => undefined);
  }
  await dockerExec("rm", "-f", backupPath).catch(() => undefined);
}
