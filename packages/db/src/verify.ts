import type { Pool } from "pg";

import { createDatabasePool, expectedTableNames } from "./index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const serialTables = expectedTableNames.filter(
  (table) =>
    ![
      "auth_accounts",
      "auth_passkeys",
      "auth_sessions",
      "auth_two_factors",
      "auth_verifications",
      "ai_bot_admin_settings",
      "ai_model_catalog",
      "ai_user_settings",
      "notification_preferences",
      "note_tags",
    ].includes(table),
);

const ownershipQueries = [
  [
    "notes.parent_id",
    `select count(*)::int as count
       from notes child
       join notes parent on parent.id = child.parent_id
      where child.user_id <> parent.user_id`,
  ],
  [
    "attachment_folders.parent_id",
    `select count(*)::int as count
       from attachment_folders child
       join attachment_folders parent on parent.id = child.parent_id
      where child.user_id <> parent.user_id`,
  ],
  [
    "notes.attachment_folder_id",
    `select count(*)::int as count
       from notes n
       join attachment_folders f on f.id = n.attachment_folder_id
      where n.user_id <> f.user_id`,
  ],
  [
    "attachments.note_id",
    `select count(*)::int as count
       from attachments a
       join notes n on n.id = a.note_id
      where a.user_id <> n.user_id`,
  ],
  [
    "attachments.folder_id",
    `select count(*)::int as count
       from attachments a
       join attachment_folders f on f.id = a.folder_id
      where a.user_id <> f.user_id`,
  ],
  [
    "attachment_uploads.note_id",
    `select count(*)::int as count
       from attachment_uploads u
       join notes n on n.id = u.note_id
      where u.user_id <> n.user_id`,
  ],
  [
    "attachment_uploads.folder_id",
    `select count(*)::int as count
       from attachment_uploads u
       join attachment_folders f on f.id = u.folder_id
      where u.user_id <> f.user_id`,
  ],
  [
    "note_tags",
    `select count(*)::int as count
       from note_tags nt
       join notes n on n.id = nt.note_id
       join tags t on t.id = nt.tag_id
      where nt.user_id <> n.user_id or nt.user_id <> t.user_id`,
  ],
  [
    "note_versions",
    `select count(*)::int as count
       from note_versions v
       join notes n on n.id = v.note_id
      where v.user_id <> n.user_id`,
  ],
  [
    "share_links",
    `select count(*)::int as count
       from share_links s
       join notes n on n.id = s.note_id
      where s.user_id <> n.user_id`,
  ],
  [
    "ai_note_embeddings",
    `select count(*)::int as count
       from ai_note_embeddings e
       join notes n on n.id = e.note_id
      where e.user_id <> n.user_id`,
  ],
  [
    "ai_model_routes.provider_setting_id",
    `select count(*)::int as count
       from ai_model_routes r
       join ai_provider_settings p on p.id = r.provider_setting_id
      where r.user_id <> p.user_id`,
  ],
  [
    "ai_usage_logs.conversation_id",
    `select count(*)::int as count
       from ai_usage_logs u
       join ai_conversations c on c.id = u.conversation_id
      where u.user_id <> c.user_id`,
  ],
  [
    "ai_usage_logs.message_id",
    `select count(*)::int as count
       from ai_usage_logs u
       join ai_messages m on m.id = u.message_id
      where u.user_id <> m.user_id`,
  ],
  [
    "ai_usage_logs conversation/message",
    `select count(*)::int as count
       from ai_usage_logs u
       join ai_messages m on m.id = u.message_id
      where u.conversation_id is not null
        and u.conversation_id <> m.conversation_id`,
  ],
] as const;

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function verifyTables(pool: Pool, issues: string[]): Promise<void> {
  const result = await pool.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const actual = new Set(result.rows.map((row) => row.table_name));

  for (const table of expectedTableNames) {
    if (!actual.has(table)) {
      issues.push(`missing table: ${table}`);
    }
  }
}

async function verifyExtensions(pool: Pool, issues: string[]): Promise<void> {
  const result = await pool.query<{ extname: string }>(
    `select extname from pg_extension where extname = any($1::text[])`,
    [["pg_trgm", "vector"]],
  );
  const actual = new Set(result.rows.map((row) => row.extname));

  for (const extension of ["pg_trgm", "vector"]) {
    if (!actual.has(extension)) {
      issues.push(`missing extension: ${extension}`);
    }
  }
}

async function verifyOwnership(pool: Pool, issues: string[]): Promise<void> {
  for (const [name, query] of ownershipQueries) {
    const result = await pool.query<{ count: number }>(query);
    const count = result.rows[0]?.count ?? 0;

    if (count > 0) {
      issues.push(`${name}: ${count} cross-user relation(s)`);
    }
  }
}

async function verifyCycles(pool: Pool, issues: string[]): Promise<void> {
  for (const table of ["notes", "attachment_folders"]) {
    const name = quoteIdentifier(table);
    const result = await pool.query<{ has_cycle: boolean }>(
      `with recursive tree as (
         select id, parent_id, array[id] as path, false as cycle
           from ${name}
         union all
         select child.id,
                child.parent_id,
                tree.path || child.id,
                child.id = any(tree.path)
           from tree
           join ${name} child on child.parent_id = tree.id
          where not tree.cycle
       )
       select exists(select 1 from tree where cycle) as has_cycle`,
    );

    if (result.rows[0]?.has_cycle) {
      issues.push(`${table}: hierarchy cycle detected`);
    }
  }
}

async function verifySequences(pool: Pool, issues: string[]): Promise<void> {
  for (const table of serialTables) {
    const tableName = quoteIdentifier(table);
    const sequenceResult = await pool.query<{ sequence_name: string | null }>(
      "select pg_get_serial_sequence($1, 'id') as sequence_name",
      [`public.${table}`],
    );
    const sequence = sequenceResult.rows[0]?.sequence_name;

    if (!sequence) {
      issues.push(`${table}: missing id sequence`);
      continue;
    }

    const parts = sequence.split(".");
    const sequenceName = parts.at(-1);

    if (!sequenceName) {
      issues.push(`${table}: invalid id sequence name`);
      continue;
    }

    const [maxResult, stateResult] = await Promise.all([
      pool.query<{ max_id: string }>(
        `select coalesce(max(id), 0)::text as max_id from ${tableName}`,
      ),
      pool.query<{ is_called: boolean; last_value: string }>(
        `select is_called, last_value::text from ${quoteIdentifier(sequenceName)}`,
      ),
    ]);
    const maxId = BigInt(maxResult.rows[0]?.max_id ?? "0");
    const state = stateResult.rows[0];
    const nextId =
      BigInt(state?.last_value ?? "0") + (state?.is_called ? 1n : 0n);

    if (nextId <= maxId) {
      issues.push(
        `${table}: next sequence value ${nextId} is not above MAX(id) ${maxId}`,
      );
    }
  }
}

const pool = createDatabasePool(connectionString, { max: 4 });
const issues: string[] = [];

try {
  await verifyExtensions(pool, issues);
  await verifyTables(pool, issues);

  if (issues.length === 0) {
    await verifyOwnership(pool, issues);
    await verifyCycles(pool, issues);
    await verifySequences(pool, issues);
  }

  if (issues.length > 0) {
    throw new Error(`Database verification failed:\n- ${issues.join("\n- ")}`);
  }

  console.log(
    `Database verification passed for ${expectedTableNames.length} tables`,
  );
} finally {
  await pool.end();
}
