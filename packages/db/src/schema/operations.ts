import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./identity.js";

type JsonObject = Record<string, unknown>;

export const dataRetentionPolicyKeys = [
  "activity_logs",
  "ai_audit_logs",
  "ai_bot_webhook_events",
  "request_error_logs",
] as const;

export type DataRetentionPolicyKey = (typeof dataRetentionPolicyKeys)[number];

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id"),
    details: jsonb("details").$type<JsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("activity_logs_created_id_idx").on(table.createdAt, table.id),
    index("activity_logs_actor_created_idx").on(
      table.actorId,
      table.createdAt,
      table.id,
    ),
    index("activity_logs_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    index("activity_logs_action_created_idx").on(
      table.action,
      table.createdAt,
      table.id,
    ),
  ],
);

export const requestErrorLogs = pgTable(
  "request_error_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    message: text("message"),
    errorName: text("error_name"),
    errorBody: jsonb("error_body").$type<JsonObject>().notNull().default({}),
    correlationId: text("correlation_id"),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("request_error_logs_created_id_idx").on(table.createdAt, table.id),
    index("request_error_logs_correlation_idx").on(
      table.correlationId,
      table.createdAt,
      table.id,
    ),
    index("request_error_logs_status_created_idx").on(
      table.statusCode,
      table.createdAt,
      table.id,
    ),
    index("request_error_logs_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    check(
      "request_error_logs_status_code_check",
      sql`${table.statusCode} between 400 and 599`,
    ),
    check("request_error_logs_duration_check", sql`${table.durationMs} >= 0`),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  subscriptionEvents: boolean("subscription_events").default(true).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind")
      .$type<"subscription_purchase" | "subscription_renew">()
      .notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
    sourceKey: text("source_key").notNull(),
    readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_notifications_source_unique").on(table.sourceKey),
    index("user_notifications_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    index("user_notifications_user_unread_idx")
      .on(table.userId, table.createdAt, table.id)
      .where(sql`${table.readAt} is null`),
    check(
      "user_notifications_kind_check",
      sql`${table.kind} in ('subscription_purchase', 'subscription_renew')`,
    ),
  ],
);

export const dataRetentionPolicies = pgTable(
  "data_retention_policies",
  {
    id: serial("id").primaryKey(),
    policyKey: text("policy_key").$type<DataRetentionPolicyKey>().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    retentionDays: integer("retention_days").notNull(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastStartedAt: timestamp("last_started_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastCompletedAt: timestamp("last_completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastDeletedCount: integer("last_deleted_count").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("data_retention_policies_key_unique").on(table.policyKey),
    check(
      "data_retention_policies_key_check",
      sql`${table.policyKey} in ('activity_logs', 'ai_audit_logs', 'ai_bot_webhook_events', 'request_error_logs')`,
    ),
    check(
      "data_retention_policies_days_check",
      sql`${table.retentionDays} between 7 and 3650`,
    ),
    check(
      "data_retention_policies_deleted_count_check",
      sql`${table.lastDeletedCount} >= 0`,
    ),
  ],
);
