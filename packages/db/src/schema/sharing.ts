import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./identity.js";
import { notes } from "./workspace.js";

export const shareLinks = pgTable(
  "share_links",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    publicUrl: text("public_url"),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    includeSecrets: boolean("include_secrets").notNull().default(false),
    maxAccessCount: integer("max_access_count"),
    accessCount: integer("access_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    lastAccessedAt: timestamp("last_accessed_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
      name: "share_links_note_user_fk",
    }).onDelete("cascade"),
    uniqueIndex("share_links_token_hash_unique").on(table.tokenHash),
    index("share_links_note_created_idx").on(table.noteId, table.createdAt),
    index("share_links_active_idx").on(table.revokedAt, table.expiresAt),
    check("share_links_access_count_check", sql`${table.accessCount} >= 0`),
    check(
      "share_links_max_access_count_check",
      sql`${table.maxAccessCount} is null or ${table.maxAccessCount} > 0`,
    ),
  ],
);

export const shareLinkAccessLogs = pgTable(
  "share_link_access_logs",
  {
    id: serial("id").primaryKey(),
    shareLinkId: integer("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    accessedAt: timestamp("accessed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    userAgent: text("user_agent"),
    ipAddress: inet("ip_address"),
  },
  (table) => [
    index("share_link_access_logs_link_accessed_idx").on(
      table.shareLinkId,
      table.accessedAt,
      table.id,
    ),
  ],
);
