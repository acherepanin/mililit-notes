import Cursor from "pg-cursor";
import type { PoolClient, QueryResultRow } from "pg";

import { createDatabasePool, expectedTableNames } from "./index.js";

interface TableMigration {
  columns: readonly string[];
  name: (typeof expectedTableNames)[number];
  select: string;
}

const batchSize = 250;

const migrations: readonly TableMigration[] = [
  {
    name: "users",
    columns: [
      "id",
      "username",
      "display_username",
      "password_hash",
      "auth_name",
      "auth_email",
      "email_verified",
      "email_is_placeholder",
      "two_factor_enabled",
      "role",
      "language",
      "theme",
      "email",
      "first_name",
      "last_name",
      "patronymic",
      "birth_date",
      "last_login_at",
      "created_at",
      "updated_at",
    ],
    select: `select id, username, username as display_username, password_hash,
                    coalesce(nullif(concat_ws(' ', first_name, last_name), ''), username) as auth_name,
                    case
                      when nullif(btrim(email), '') is not null
                       and (select count(*) from users candidate
                             where lower(btrim(candidate.email)) = lower(btrim(users.email))) = 1
                        then lower(btrim(email))
                      else 'legacy-' || id || '@invalid.notes.local'
                    end as auth_email,
                    true as email_verified,
                    nullif(btrim(email), '') is null
                      or (select count(*) from users candidate
                           where lower(btrim(candidate.email)) = lower(btrim(users.email))) <> 1
                      as email_is_placeholder,
                    false as two_factor_enabled,
                    role, language, theme, email, first_name, last_name, patronymic,
                    nullif(birth_date, '')::date as birth_date,
                    nullif(last_login_at, '')::timestamptz as last_login_at,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from users order by id`,
  },
  {
    name: "pending_registrations",
    columns: [
      "id",
      "username",
      "password_hash",
      "email",
      "first_name",
      "last_name",
      "token_hash",
      "expires_at",
      "verified_at",
      "created_at",
    ],
    select: `select id, username, password_hash, email, first_name, last_name,
                    token_hash, expires_at::timestamptz as expires_at,
                    nullif(verified_at, '')::timestamptz as verified_at,
                    created_at::timestamptz as created_at
               from pending_registrations order by id`,
  },
  {
    name: "subscription_plans",
    columns: [
      "id",
      "slug",
      "name",
      "description",
      "price_cents",
      "currency",
      "billing_period",
      "entitlements",
      "is_active",
      "sort_order",
      "icon_key",
      "card_color",
      "card_art",
      "is_hidden",
      "created_at",
      "updated_at",
    ],
    select: `select id, slug, name, description, price_cents, currency,
                    billing_period, entitlements_json::jsonb::text as entitlements,
                    is_active = 1 as is_active, sort_order, icon_key, card_color,
                    card_art, is_hidden = 1 as is_hidden,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from subscription_plans order by id`,
  },
  {
    name: "attachment_folders",
    columns: [
      "id",
      "user_id",
      "parent_id",
      "name",
      "position",
      "created_at",
      "updated_at",
    ],
    select: `with recursive tree as (
               select f.*, 0 as depth
                 from attachment_folders f
                where f.parent_id is null
               union all
               select f.*, tree.depth + 1
                 from tree
                 join attachment_folders f on f.parent_id = tree.id
             )
             select id, user_id, parent_id, name, position,
                    created_at::timestamptz as created_at,
                    created_at::timestamptz as updated_at
               from tree order by depth, id`,
  },
  {
    name: "notes",
    columns: [
      "id",
      "user_id",
      "name",
      "content_html",
      "content_text",
      "parent_id",
      "position",
      "is_favorite",
      "is_pinned",
      "deleted_at",
      "deleted_by",
      "delete_reason",
      "attachment_folder_id",
      "revision",
      "created_at",
      "updated_at",
    ],
    select: `with recursive tree as (
               select n.*, 0 as depth
                 from notes n
                where n.parent_id is null
               union all
               select n.*, tree.depth + 1
                 from tree
                 join notes n on n.parent_id = tree.id
             )
             select id, user_id, name, content_html, content_text, parent_id,
                    position, is_favorite = 1 as is_favorite,
                    is_pinned = 1 as is_pinned,
                    nullif(deleted_at, '')::timestamptz as deleted_at,
                    deleted_by, delete_reason, attachment_folder_id,
                    1 as revision,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from tree order by depth, id`,
  },
  {
    name: "tags",
    columns: ["id", "user_id", "name", "color", "created_at", "updated_at"],
    select: `select id, user_id, name, color,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from tags order by id`,
  },
  {
    name: "note_tags",
    columns: ["user_id", "note_id", "tag_id", "created_at"],
    select: `select n.user_id, nt.note_id, nt.tag_id,
                    nt.created_at::timestamptz as created_at
               from note_tags nt
               join notes n on n.id = nt.note_id
              order by nt.note_id, nt.tag_id`,
  },
  {
    name: "note_versions",
    columns: [
      "id",
      "note_id",
      "user_id",
      "name",
      "content_html",
      "content_text",
      "created_at",
    ],
    select: `select id, note_id, user_id, name, content_html, content_text,
                    created_at::timestamptz as created_at
               from note_versions order by id`,
  },
  {
    name: "note_templates",
    columns: [
      "id",
      "user_id",
      "name",
      "content_html",
      "content_text",
      "is_system",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, name, content_html, content_text,
                    is_system = 1 as is_system,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from note_templates order by id`,
  },
  {
    name: "attachments",
    columns: [
      "id",
      "user_id",
      "note_id",
      "folder_id",
      "file_name",
      "mime_type",
      "detected_mime_type",
      "size_bytes",
      "legacy_storage_path",
      "object_key",
      "checksum_sha256",
      "etag",
      "storage_status",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, note_id, folder_id, file_name, mime_type,
                    null::text as detected_mime_type, size::bigint as size_bytes,
                    storage_path as legacy_storage_path, null::text as object_key,
                    null::text as checksum_sha256, null::text as etag,
                    'pending'::text as storage_status,
                    created_at::timestamptz as created_at,
                    created_at::timestamptz as updated_at
               from attachments order by id`,
  },
  {
    name: "share_links",
    columns: [
      "id",
      "note_id",
      "user_id",
      "token_hash",
      "public_url",
      "expires_at",
      "include_secrets",
      "max_access_count",
      "access_count",
      "revoked_at",
      "created_at",
      "last_accessed_at",
    ],
    select: `select id, note_id, user_id, token_hash, public_url,
                    expires_at::timestamptz as expires_at,
                    include_secrets = 1 as include_secrets,
                    max_access_count, access_count,
                    nullif(revoked_at, '')::timestamptz as revoked_at,
                    created_at::timestamptz as created_at,
                    nullif(last_accessed_at, '')::timestamptz as last_accessed_at
               from share_links order by id`,
  },
  {
    name: "share_link_access_logs",
    columns: ["id", "share_link_id", "accessed_at", "user_agent", "ip_address"],
    select: `select id, share_link_id,
                    accessed_at::timestamptz as accessed_at, user_agent,
                    nullif(ip_address, '')::inet as ip_address
               from share_link_access_logs order by id`,
  },
  {
    name: "user_subscriptions",
    columns: [
      "id",
      "user_id",
      "plan_id",
      "status",
      "started_at",
      "expires_at",
      "cancelled_at",
      "source",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, plan_id, status,
                    started_at::timestamptz as started_at,
                    nullif(expires_at, '')::timestamptz as expires_at,
                    nullif(cancelled_at, '')::timestamptz as cancelled_at,
                    source, created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from user_subscriptions order by id`,
  },
  {
    name: "subscription_orders",
    columns: [
      "id",
      "user_id",
      "plan_id",
      "status",
      "amount_cents",
      "currency",
      "payment_provider",
      "payment_external_id",
      "paid_at",
      "term_months",
      "checkout_mode",
      "discount_percent",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, plan_id, status, amount_cents, currency,
                    payment_provider, payment_external_id,
                    nullif(paid_at, '')::timestamptz as paid_at,
                    term_months, checkout_mode, discount_percent,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from subscription_orders order by id`,
  },
  {
    name: "ai_user_settings",
    columns: [
      "user_id",
      "enabled",
      "allow_read_secrets",
      "require_action_confirmation",
      "daily_request_limit",
      "daily_token_limit",
      "provider_name",
      "base_url",
      "model",
      "api_key_encrypted",
      "api_key_hint",
      "api_key_updated_at",
      "last_connection_check_at",
      "last_connection_check_status",
      "last_models_sync_at",
      "models_sync_status",
      "models_sync_error",
      "created_at",
      "updated_at",
    ],
    select: `select user_id, enabled = 1 as enabled,
                    allow_read_secrets = 1 as allow_read_secrets,
                    require_action_confirmation = 1 as require_action_confirmation,
                    daily_request_limit, daily_token_limit, provider_name, base_url,
                    model, api_key_encrypted, api_key_hint,
                    nullif(api_key_updated_at, '')::timestamptz as api_key_updated_at,
                    nullif(last_connection_check_at, '')::timestamptz as last_connection_check_at,
                    last_connection_check_status,
                    nullif(last_models_sync_at, '')::timestamptz as last_models_sync_at,
                    models_sync_status, models_sync_error,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_user_settings order by user_id`,
  },
  {
    name: "ai_provider_settings",
    columns: [
      "id",
      "user_id",
      "provider_name",
      "base_url",
      "model",
      "api_key_encrypted",
      "api_key_hint",
      "api_key_updated_at",
      "last_connection_check_at",
      "last_connection_check_status",
      "last_models_sync_at",
      "models_sync_status",
      "models_sync_error",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, provider_name, base_url, model,
                    api_key_encrypted, api_key_hint,
                    nullif(api_key_updated_at, '')::timestamptz as api_key_updated_at,
                    nullif(last_connection_check_at, '')::timestamptz as last_connection_check_at,
                    last_connection_check_status,
                    nullif(last_models_sync_at, '')::timestamptz as last_models_sync_at,
                    models_sync_status, models_sync_error,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_provider_settings order by id`,
  },
  {
    name: "ai_provider_models",
    columns: [
      "id",
      "user_id",
      "provider_name",
      "model_id",
      "label",
      "tier",
      "quality",
      "speed",
      "cost",
      "input_price_per_1m",
      "cached_input_price_per_1m",
      "output_price_per_1m",
      "capabilities",
      "is_deprecated",
      "provider_created_at",
      "last_seen_at",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, provider_name, model_id, label, tier, quality,
                    speed, cost, input_price_per_1m, cached_input_price_per_1m,
                    output_price_per_1m, capabilities::jsonb::text as capabilities,
                    is_deprecated = 1 as is_deprecated,
                    case when provider_created_at is null then null
                         else to_timestamp(provider_created_at) end as provider_created_at,
                    last_seen_at::timestamptz as last_seen_at,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_provider_models order by id`,
  },
  {
    name: "ai_model_catalog",
    columns: [
      "model_id",
      "label",
      "tier",
      "quality",
      "speed",
      "cost",
      "score",
      "speed_score",
      "value_score",
      "sort_rank",
      "input_price_per_1m",
      "cached_input_price_per_1m",
      "output_price_per_1m",
      "capabilities",
      "is_deprecated",
      "source",
      "last_seen_at",
      "created_at",
      "updated_at",
    ],
    select: `select model_id, label, tier, quality, speed, cost, score,
                    speed_score, value_score, sort_rank, input_price_per_1m,
                    cached_input_price_per_1m, output_price_per_1m,
                    capabilities::jsonb::text as capabilities,
                    is_deprecated = 1 as is_deprecated, source,
                    last_seen_at::timestamptz as last_seen_at,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_model_catalog order by model_id`,
  },
  {
    name: "ai_usage_logs",
    columns: [
      "id",
      "user_id",
      "provider_name",
      "model",
      "input_tokens",
      "output_tokens",
      "created_at",
    ],
    select: `select id, user_id, provider_name, model, input_tokens,
                    output_tokens, created_at::timestamptz as created_at
               from ai_usage_logs order by id`,
  },
  {
    name: "ai_audit_logs",
    columns: [
      "id",
      "user_id",
      "action",
      "target_type",
      "target_id",
      "details",
      "created_at",
    ],
    select: `select id, user_id, action, target_type, target_id,
                    details::jsonb::text as details,
                    created_at::timestamptz as created_at
               from ai_audit_logs order by id`,
  },
  {
    name: "ai_note_embeddings",
    columns: [
      "id",
      "user_id",
      "note_id",
      "provider_name",
      "base_url",
      "model",
      "content_hash",
      "embedding",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, note_id, provider_name, base_url, model,
                    content_hash, vector_json::jsonb::text as embedding,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_note_embeddings order by id`,
  },
  {
    name: "ai_bot_admin_settings",
    columns: [
      "provider",
      "enabled",
      "webhook_url",
      "bot_token_encrypted",
      "access_token_encrypted",
      "secret_encrypted",
      "group_id",
      "confirmation_code",
      "allow_secrets",
      "require_confirmation",
      "daily_request_limit",
      "daily_read_limit",
      "daily_write_limit",
      "last_check_at",
      "last_check_status",
      "last_check_error",
      "created_at",
      "updated_at",
    ],
    select: `select provider, enabled = 1 as enabled, webhook_url,
                    bot_token_encrypted, access_token_encrypted, secret_encrypted,
                    group_id, confirmation_code, allow_secrets = 1 as allow_secrets,
                    require_confirmation = 1 as require_confirmation,
                    daily_request_limit, daily_read_limit, daily_write_limit,
                    nullif(last_check_at, '')::timestamptz as last_check_at,
                    last_check_status, last_check_error,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_bot_admin_settings order by provider`,
  },
  {
    name: "ai_bot_user_settings",
    columns: [
      "id",
      "user_id",
      "provider",
      "enabled",
      "access_mode",
      "allow_secrets",
      "allow_note_read",
      "allow_note_write",
      "allow_note_delete",
      "allow_tags",
      "allow_templates",
      "allow_versions",
      "allow_attachments",
      "allow_share_links",
      "daily_request_limit",
      "daily_read_limit",
      "daily_write_limit",
      "linked_external_id",
      "linked_username",
      "linked_at",
      "created_at",
      "updated_at",
    ],
    select: `select id, user_id, provider, enabled = 1 as enabled, access_mode,
                    allow_secrets = 1 as allow_secrets,
                    allow_note_read = 1 as allow_note_read,
                    allow_note_write = 1 as allow_note_write,
                    allow_note_delete = 1 as allow_note_delete,
                    allow_tags = 1 as allow_tags,
                    allow_templates = 1 as allow_templates,
                    allow_versions = 1 as allow_versions,
                    allow_attachments = 1 as allow_attachments,
                    allow_share_links = 1 as allow_share_links,
                    daily_request_limit, daily_read_limit, daily_write_limit,
                    linked_external_id, linked_username,
                    nullif(linked_at, '')::timestamptz as linked_at,
                    created_at::timestamptz as created_at,
                    updated_at::timestamptz as updated_at
               from ai_bot_user_settings order by id`,
  },
  {
    name: "ai_bot_link_codes",
    columns: [
      "id",
      "user_id",
      "provider",
      "code_hash",
      "expires_at",
      "created_at",
    ],
    select: `select id, user_id, provider, code_hash,
                    expires_at::timestamptz as expires_at,
                    created_at::timestamptz as created_at
               from ai_bot_link_codes order by id`,
  },
  {
    name: "ai_bot_pending_actions",
    columns: [
      "id",
      "user_id",
      "provider",
      "external_id",
      "action_name",
      "action_payload",
      "expires_at",
      "created_at",
    ],
    select: `select id, user_id, provider, external_id, action_name,
                    action_payload::jsonb::text as action_payload,
                    expires_at::timestamptz as expires_at,
                    created_at::timestamptz as created_at
               from ai_bot_pending_actions order by id`,
  },
  {
    name: "ai_bot_usage_logs",
    columns: [
      "id",
      "user_id",
      "provider",
      "kind",
      "action_name",
      "usage_count",
      "created_at",
    ],
    select: `select id, user_id, provider, kind, action_name, usage_count,
                    created_at::timestamptz as created_at
               from ai_bot_usage_logs order by id`,
  },
  {
    name: "activity_logs",
    columns: [
      "id",
      "actor_id",
      "user_id",
      "action",
      "target_type",
      "target_id",
      "details",
      "created_at",
    ],
    select: `select id, actor_id, user_id, action, target_type, target_id,
                    details::jsonb::text as details,
                    created_at::timestamptz as created_at
               from activity_logs order by id`,
  },
  {
    name: "request_error_logs",
    columns: [
      "id",
      "user_id",
      "method",
      "path",
      "status_code",
      "message",
      "error_name",
      "error_body",
      "duration_ms",
      "created_at",
    ],
    select: `select id, user_id, method, path, status_code, message, error_name,
                    error_body::jsonb::text as error_body, duration_ms,
                    created_at::timestamptz as created_at
               from request_error_logs order by id`,
  },
];

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
      "note_tags",
    ].includes(table),
);

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function assertDifferentDatabases(
  source: PoolClient,
  target: PoolClient,
): Promise<void> {
  const query = `select current_database() as database,
                        coalesce(inet_server_addr()::text, 'local') as host,
                        inet_server_port() as port`;
  const [sourceIdentity, targetIdentity] = await Promise.all([
    source.query<{ database: string; host: string; port: number }>(query),
    target.query<{ database: string; host: string; port: number }>(query),
  ]);

  if (
    JSON.stringify(sourceIdentity.rows[0]) ===
    JSON.stringify(targetIdentity.rows[0])
  ) {
    throw new Error("Legacy source and v2 target resolve to the same database");
  }
}

async function assertEmptyTarget(target: PoolClient): Promise<void> {
  for (const table of expectedTableNames) {
    const result = await target.query<{ count: number }>(
      `select count(*)::int as count from ${quoteIdentifier(table)}`,
    );

    if ((result.rows[0]?.count ?? 0) > 0) {
      throw new Error(`Target table ${table} is not empty`);
    }
  }
}

async function createLegacyCredentialAccounts(
  target: PoolClient,
): Promise<void> {
  await target.query(
    `insert into auth_accounts (
       id, user_id, account_id, provider_id, password, created_at, updated_at
     )
     select 'legacy-credential-' || id,
            id,
            id::text,
            'credential',
            password_hash,
            created_at,
            updated_at
       from users
      where password_hash is not null`,
  );
}

async function assertValidColumn(
  source: PoolClient,
  table: string,
  column: string,
  predicate: string,
  description: string,
): Promise<void> {
  const tableName = quoteIdentifier(table);
  const columnName = quoteIdentifier(column);
  const result = await source.query<{
    count: number;
    examples: string[] | null;
  }>(
    `select count(*)::int as count,
            (array_agg(ctid::text order by ctid))[1:5] as examples
       from ${tableName}
      where ${columnName} is not null and not (${predicate})`,
  );
  const invalid = result.rows[0];

  if ((invalid?.count ?? 0) > 0) {
    throw new Error(
      `${table}.${column} contains ${invalid?.count ?? 0} invalid ${description} value(s); row locators: ${(invalid?.examples ?? []).join(", ")}`,
    );
  }
}

async function validateLegacyValues(source: PoolClient): Promise<void> {
  const columns = await source.query<{
    column_name: string;
    data_type: string;
    table_name: string;
  }>(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [expectedTableNames],
  );

  for (const column of columns.rows) {
    if (
      column.data_type === "integer" &&
      (column.column_name === "enabled" ||
        column.column_name.startsWith("allow_") ||
        column.column_name.startsWith("is_") ||
        column.column_name.startsWith("require_") ||
        column.column_name === "include_secrets")
    ) {
      await assertValidColumn(
        source,
        column.table_name,
        column.column_name,
        `${quoteIdentifier(column.column_name)} in (0, 1)`,
        "boolean",
      );
    }

    if (column.data_type === "text" && column.column_name.endsWith("_at")) {
      await assertValidColumn(
        source,
        column.table_name,
        column.column_name,
        `pg_input_is_valid(${quoteIdentifier(column.column_name)}, 'timestamp with time zone')`,
        "timestamp",
      );
    }
  }

  await assertValidColumn(
    source,
    "users",
    "birth_date",
    `pg_input_is_valid("birth_date", 'date')`,
    "date",
  );

  for (const [table, column] of [
    ["activity_logs", "details"],
    ["ai_audit_logs", "details"],
    ["ai_bot_pending_actions", "action_payload"],
    ["ai_model_catalog", "capabilities"],
    ["ai_note_embeddings", "vector_json"],
    ["ai_provider_models", "capabilities"],
    ["request_error_logs", "error_body"],
    ["subscription_plans", "entitlements_json"],
  ] as const) {
    await assertValidColumn(
      source,
      table,
      column,
      `pg_input_is_valid(${quoteIdentifier(column)}, 'jsonb')`,
      "JSON",
    );
  }

  await assertValidColumn(
    source,
    "share_link_access_logs",
    "ip_address",
    `"ip_address" = '' or pg_input_is_valid("ip_address", 'inet')`,
    "IP address",
  );

  const vectorResult = await source.query<{ count: number }>(
    `select count(*)::int as count
       from ai_note_embeddings
      where jsonb_typeof(vector_json::jsonb) <> 'array'
         or exists (
              select 1
                from jsonb_array_elements(vector_json::jsonb) value
               where jsonb_typeof(value) <> 'number'
            )`,
  );

  if ((vectorResult.rows[0]?.count ?? 0) > 0) {
    throw new Error(
      "ai_note_embeddings.vector_json contains a non-numeric vector",
    );
  }

  const integrityQueries = [
    `select count(*)::int as count from notes child
      join notes parent on parent.id = child.parent_id
     where child.user_id <> parent.user_id`,
    `select count(*)::int as count from attachment_folders child
      join attachment_folders parent on parent.id = child.parent_id
     where child.user_id <> parent.user_id`,
    `select count(*)::int as count from notes n
      join attachment_folders f on f.id = n.attachment_folder_id
     where n.user_id <> f.user_id`,
    `select count(*)::int as count from attachments a
      join notes n on n.id = a.note_id
     where a.user_id <> n.user_id`,
    `select count(*)::int as count from attachments a
      join attachment_folders f on f.id = a.folder_id
     where a.user_id <> f.user_id`,
    `select count(*)::int as count from note_tags nt
      join notes n on n.id = nt.note_id
      join tags t on t.id = nt.tag_id
     where n.user_id <> t.user_id`,
    `select count(*)::int as count from note_versions v
      join notes n on n.id = v.note_id
     where v.user_id <> n.user_id`,
    `select count(*)::int as count from share_links s
      join notes n on n.id = s.note_id
     where s.user_id <> n.user_id`,
    `select count(*)::int as count from ai_note_embeddings e
      join notes n on n.id = e.note_id
     where e.user_id <> n.user_id`,
  ];

  for (const query of integrityQueries) {
    const result = await source.query<{ count: number }>(query);
    if ((result.rows[0]?.count ?? 0) > 0) {
      throw new Error("Legacy database contains a cross-user relation");
    }
  }

  for (const table of ["notes", "attachment_folders"]) {
    const name = quoteIdentifier(table);
    const result = await source.query<{ has_cycle: boolean }>(
      `with recursive tree as (
         select id, parent_id, array[id] as path, false as cycle from ${name}
         union all
         select child.id, child.parent_id, tree.path || child.id,
                child.id = any(tree.path)
           from tree
           join ${name} child on child.parent_id = tree.id
          where not tree.cycle
       )
       select exists(select 1 from tree where cycle) as has_cycle`,
    );

    if (result.rows[0]?.has_cycle) {
      throw new Error(`Legacy ${table} hierarchy contains a cycle`);
    }
  }
}

async function insertBatch(
  target: PoolClient,
  migration: TableMigration,
  rows: QueryResultRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = migration.columns.map((column, columnIndex) => {
      if (!(column in row)) {
        throw new Error(`Source query for ${migration.name} omitted ${column}`);
      }

      values.push(row[column]);
      return `$${rowIndex * migration.columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const columns = migration.columns.map(quoteIdentifier).join(", ");

  await target.query(
    `insert into ${quoteIdentifier(migration.name)} (${columns}) values ${tuples.join(", ")}`,
    values,
  );
}

async function migrateTable(
  source: PoolClient,
  target: PoolClient,
  migration: TableMigration,
): Promise<number> {
  const cursor = source.query(new Cursor<QueryResultRow>(migration.select));
  let count = 0;

  try {
    while (true) {
      const rows = await cursor.read(batchSize);
      if (rows.length === 0) {
        break;
      }

      await insertBatch(target, migration, rows);
      count += rows.length;
    }
  } finally {
    await cursor.close();
  }

  return count;
}

async function reconcileSequences(target: PoolClient): Promise<void> {
  for (const table of serialTables) {
    const name = quoteIdentifier(table);
    await target.query(
      `select setval(
         pg_get_serial_sequence('public.${table}', 'id'),
         greatest(coalesce(max(id), 0) + 1, 1),
         false
       ) from ${name}`,
    );
  }
}

async function compareCounts(
  source: PoolClient,
  target: PoolClient,
  importedCounts: ReadonlyMap<string, number>,
): Promise<void> {
  for (const table of importedCounts.keys()) {
    const name = quoteIdentifier(table);
    const [sourceResult, targetResult] = await Promise.all([
      source.query<{ count: number }>(
        `select count(*)::int as count from ${name}`,
      ),
      target.query<{ count: number }>(
        `select count(*)::int as count from ${name}`,
      ),
    ]);
    const sourceCount = sourceResult.rows[0]?.count ?? 0;
    const targetCount = targetResult.rows[0]?.count ?? 0;
    const importedCount = importedCounts.get(table) ?? 0;

    if (sourceCount !== targetCount || sourceCount !== importedCount) {
      throw new Error(
        `${table} row-count mismatch: source=${sourceCount}, imported=${importedCount}, target=${targetCount}`,
      );
    }
  }
}

const sourceUrl = process.env.LEGACY_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  throw new Error("LEGACY_DATABASE_URL and DATABASE_URL are required");
}

if (sourceUrl === targetUrl) {
  throw new Error("LEGACY_DATABASE_URL and DATABASE_URL must be different");
}

const sourcePool = createDatabasePool(sourceUrl, { max: 1 });
const targetPool = createDatabasePool(targetUrl, { max: 1 });
const source = await sourcePool.connect();
const target = await targetPool.connect();
let sourceTransaction = false;
let targetTransaction = false;

try {
  await assertDifferentDatabases(source, target);
  await source.query(
    "begin transaction isolation level repeatable read read only",
  );
  sourceTransaction = true;
  await target.query("begin");
  targetTransaction = true;

  await assertEmptyTarget(target);
  await validateLegacyValues(source);

  const importedCounts = new Map<string, number>();
  for (const migration of migrations) {
    const count = await migrateTable(source, target, migration);
    importedCounts.set(migration.name, count);
    console.log(`${migration.name}: ${count} row(s)`);
  }

  await createLegacyCredentialAccounts(target);
  await reconcileSequences(target);
  await compareCounts(source, target, importedCounts);
  await source.query("commit");
  sourceTransaction = false;
  await target.query("commit");
  targetTransaction = false;
  console.log("Legacy database import completed; run db:verify before cutover");
} catch (error) {
  if (sourceTransaction) {
    await source.query("rollback");
  }
  if (targetTransaction) {
    await target.query("rollback");
  }
  throw error;
} finally {
  source.release();
  target.release();
  await Promise.all([sourcePool.end(), targetPool.end()]);
}
