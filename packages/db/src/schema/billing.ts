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
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./identity.js";

export type EntitlementValue =
  | boolean
  | number
  | string
  | null
  | EntitlementValue[]
  | { [key: string]: EntitlementValue };
export type Entitlements = Record<string, EntitlementValue>;

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("rub"),
    billingPeriod: text("billing_period").notNull().default("month"),
    entitlements: jsonb("entitlements")
      .$type<Entitlements>()
      .notNull()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    iconKey: text("icon_key").notNull().default("package"),
    cardColor: text("card_color").notNull().default("sky"),
    cardArt: text("card_art").notNull().default("bubbles"),
    isHidden: boolean("is_hidden").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("subscription_plans_slug_unique").on(table.slug),
    index("subscription_plans_visible_order_idx").on(
      table.isActive,
      table.isHidden,
      table.sortOrder,
      table.id,
    ),
    check("subscription_plans_price_check", sql`${table.priceCents} >= 0`),
    check("subscription_plans_revision_check", sql`${table.revision} > 0`),
    check(
      "subscription_plans_billing_period_check",
      sql`${table.billingPeriod} in ('month', 'year', 'lifetime')`,
    ),
  ],
);

export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: text("status").notNull().default("active"),
    startedAt: timestamp("started_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    cancelledAt: timestamp("cancelled_at", {
      mode: "date",
      withTimezone: true,
    }),
    source: text("source").notNull().default("migration"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("user_subscriptions_user_status_idx").on(
      table.userId,
      table.status,
      table.expiresAt,
      table.id,
    ),
    check(
      "user_subscriptions_status_check",
      sql`${table.status} in ('active', 'cancelled', 'expired', 'pending')`,
    ),
    check(
      "user_subscriptions_dates_check",
      sql`${table.expiresAt} is null or ${table.expiresAt} >= ${table.startedAt}`,
    ),
  ],
);

export const subscriptionOrders = pgTable(
  "subscription_orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: text("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("rub"),
    paymentProvider: text("payment_provider").notNull().default("mock"),
    paymentExternalId: text("payment_external_id"),
    paidAt: timestamp("paid_at", { mode: "date", withTimezone: true }),
    termMonths: integer("term_months").notNull().default(1),
    checkoutMode: text("checkout_mode").notNull().default("purchase"),
    discountPercent: integer("discount_percent").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("subscription_orders_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    index("subscription_orders_provider_external_idx").on(
      table.paymentProvider,
      table.paymentExternalId,
    ),
    check(
      "subscription_orders_status_check",
      sql`${table.status} in ('pending', 'paid', 'cancelled', 'failed', 'refunded')`,
    ),
    check("subscription_orders_amount_check", sql`${table.amountCents} >= 0`),
    check("subscription_orders_term_check", sql`${table.termMonths} > 0`),
    check(
      "subscription_orders_discount_check",
      sql`${table.discountPercent} between 0 and 100`,
    ),
  ],
);
