import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    displayUsername: text("display_username"),
    passwordHash: text("password_hash"),
    name: text("auth_name").notNull(),
    email: text("auth_email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailIsPlaceholder: boolean("email_is_placeholder")
      .notNull()
      .default(false),
    image: text("image"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    role: text("role").notNull().default("user"),
    language: text("language").notNull().default("ru"),
    theme: text("theme").notNull().default("dark"),
    panelOpacity: integer("panel_opacity").notNull().default(78),
    backgroundMotion: boolean("background_motion").notNull().default(true),
    starfall: boolean("starfall").notNull().default(true),
    editorContentWidth: integer("editor_content_width").notNull().default(920),
    editorPagePadding: integer("editor_page_padding").notNull().default(24),
    editorBlockSpacing: integer("editor_block_spacing").notNull().default(12),
    preferredAiModel: text("preferred_ai_model"),
    profileEmail: text("email"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    patronymic: text("patronymic"),
    birthDate: date("birth_date", { mode: "string" }),
    lastLoginAt: timestamp("last_login_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    uniqueIndex("users_auth_email_unique").on(table.email),
    index("users_email_idx").on(table.profileEmail),
    check("users_role_check", sql`${table.role} in ('user', 'admin')`),
    check("users_language_check", sql`${table.language} in ('ru', 'en')`),
    check(
      "users_theme_check",
      sql`${table.theme} in ('dark', 'light', 'system')`,
    ),
    check(
      "users_panel_opacity_check",
      sql`${table.panelOpacity} between 35 and 100`,
    ),
    check(
      "users_editor_content_width_check",
      sql`${table.editorContentWidth} between 560 and 1200`,
    ),
    check(
      "users_editor_page_padding_check",
      sql`${table.editorPagePadding} between 8 and 64`,
    ),
    check(
      "users_editor_block_spacing_check",
      sql`${table.editorBlockSpacing} between 4 and 32`,
    ),
  ],
);

export const pendingRegistrations = pgTable(
  "pending_registrations",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    verifiedAt: timestamp("verified_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("pending_registrations_token_hash_unique").on(table.tokenHash),
    index("pending_registrations_expires_at_idx").on(table.expiresAt),
    index("pending_registrations_username_idx").on(table.username),
    index("pending_registrations_email_idx").on(table.email),
    check("pending_registrations_id_check", sql`${table.id} > 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
