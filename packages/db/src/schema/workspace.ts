import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./identity.js";

export const attachmentFolders = pgTable(
  "attachment_folders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("attachment_folders_id_user_unique").on(table.id, table.userId),
    index("attachment_folders_user_parent_position_idx").on(
      table.userId,
      table.parentId,
      table.position,
    ),
    uniqueIndex("attachment_folders_user_parent_name_unique").on(
      table.userId,
      sql`coalesce(${table.parentId}, 0)`,
      sql`lower(${table.name})`,
    ),
    foreignKey({
      columns: [table.parentId, table.userId],
      foreignColumns: [table.id, table.userId],
      name: "attachment_folders_parent_user_fk",
    }).onDelete("cascade"),
    check(
      "attachment_folders_parent_check",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
    check("attachment_folders_position_check", sql`${table.position} >= 0`),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentHtml: text("content_html").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    parentId: integer("parent_id"),
    position: integer("position").notNull().default(0),
    isFavorite: boolean("is_favorite").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),
    deletedAt: timestamp("deleted_at", {
      mode: "date",
      withTimezone: true,
    }),
    deletedBy: integer("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deleteReason: text("delete_reason"),
    attachmentFolderId: integer("attachment_folder_id").references(
      () => attachmentFolders.id,
      { onDelete: "set null" },
    ),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("notes_id_user_unique").on(table.id, table.userId),
    index("notes_user_parent_position_idx").on(
      table.userId,
      table.parentId,
      table.position,
    ),
    index("notes_user_deleted_updated_idx").on(
      table.userId,
      table.deletedAt,
      table.updatedAt,
      table.id,
    ),
    foreignKey({
      columns: [table.parentId, table.userId],
      foreignColumns: [table.id, table.userId],
      name: "notes_parent_user_fk",
    }).onDelete("cascade"),
    check(
      "notes_parent_check",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
    check("notes_position_check", sql`${table.position} >= 0`),
    check("notes_revision_check", sql`${table.revision} > 0`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("tags_user_name_unique").on(table.userId, table.name),
    unique("tags_id_user_unique").on(table.id, table.userId),
  ],
);

export const noteTags = pgTable(
  "note_tags",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: integer("note_id").notNull(),
    tagId: integer("tag_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.tagId] }),
    foreignKey({
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
      name: "note_tags_note_user_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tagId, table.userId],
      foreignColumns: [tags.id, tags.userId],
      name: "note_tags_tag_user_fk",
    }).onDelete("cascade"),
    index("note_tags_user_tag_note_idx").on(
      table.userId,
      table.tagId,
      table.noteId,
    ),
  ],
);

export const noteVersions = pgTable(
  "note_versions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentHtml: text("content_html").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
      name: "note_versions_note_user_fk",
    }).onDelete("cascade"),
    index("note_versions_note_created_id_idx").on(
      table.noteId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const noteTemplates = pgTable(
  "note_templates",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    contentHtml: text("content_html").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("note_templates_user_system_idx").on(
      table.userId,
      table.isSystem,
      table.name,
    ),
    check(
      "note_templates_owner_check",
      sql`(${table.isSystem} and ${table.userId} is null) or (not ${table.isSystem} and ${table.userId} is not null)`,
    ),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: integer("note_id").references(() => notes.id, {
      onDelete: "set null",
    }),
    folderId: integer("folder_id").references(() => attachmentFolders.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    detectedMimeType: text("detected_mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    legacyStoragePath: text("legacy_storage_path"),
    objectKey: text("object_key"),
    checksumSha256: text("checksum_sha256"),
    etag: text("etag"),
    storageStatus: text("storage_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("attachments_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    index("attachments_user_folder_created_idx").on(
      table.userId,
      table.folderId,
      table.createdAt,
      table.id,
    ),
    index("attachments_user_note_created_idx").on(
      table.userId,
      table.noteId,
      table.createdAt,
      table.id,
    ),
    index("attachments_user_checksum_idx").on(
      table.userId,
      table.checksumSha256,
    ),
    uniqueIndex("attachments_user_folder_name_unique")
      .on(
        table.userId,
        sql`coalesce(${table.folderId}, 0)`,
        sql`lower(${table.fileName})`,
      )
      .where(sql`${table.storageStatus} <> 'deleted'`),
    uniqueIndex("attachments_object_key_unique")
      .on(table.objectKey)
      .where(sql`${table.objectKey} is not null`),
    check("attachments_size_bytes_check", sql`${table.sizeBytes} >= 0`),
    check(
      "attachments_storage_status_check",
      sql`${table.storageStatus} in ('pending', 'copying', 'ready', 'failed', 'deleted')`,
    ),
    check(
      "attachments_storage_location_check",
      sql`${table.legacyStoragePath} is not null or ${table.objectKey} is not null`,
    ),
  ],
);

export const attachmentUploads = pgTable(
  "attachment_uploads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: integer("note_id"),
    folderId: integer("folder_id"),
    fileName: text("file_name").notNull(),
    declaredMimeType: text("declared_mime_type")
      .notNull()
      .default("application/octet-stream"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    objectKey: text("object_key").notNull(),
    multipartUploadId: text("multipart_upload_id"),
    partSizeBytes: bigint("part_size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull().default("uploading"),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("attachment_uploads_object_key_unique").on(table.objectKey),
    index("attachment_uploads_user_status_expiry_idx").on(
      table.userId,
      table.status,
      table.expiresAt,
      table.id,
    ),
    index("attachment_uploads_expiry_cleanup_idx")
      .on(table.expiresAt, table.id)
      .where(sql`${table.status} in ('preparing', 'uploading', 'completing')`),
    index("attachment_uploads_expiring_retry_idx")
      .on(table.updatedAt, table.id)
      .where(sql`${table.status} = 'expiring'`),
    foreignKey({
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
      name: "attachment_uploads_note_user_fk",
    }),
    foreignKey({
      columns: [table.folderId, table.userId],
      foreignColumns: [attachmentFolders.id, attachmentFolders.userId],
      name: "attachment_uploads_folder_user_fk",
    }),
    check("attachment_uploads_size_check", sql`${table.sizeBytes} > 0`),
    check(
      "attachment_uploads_part_size_check",
      sql`${table.partSizeBytes} between 5242880 and 5368709120`,
    ),
    check(
      "attachment_uploads_status_check",
      sql`${table.status} in ('preparing', 'uploading', 'completing', 'expiring', 'expired', 'completed', 'aborted', 'failed')`,
    ),
    check(
      "attachment_uploads_checksum_check",
      sql`${table.checksumSha256} is null or ${table.checksumSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
