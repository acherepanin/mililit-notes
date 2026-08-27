CREATE TABLE "data_retention_policies" (
  "id" serial PRIMARY KEY NOT NULL,
  "policy_key" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "retention_days" integer NOT NULL,
  "updated_by_user_id" integer,
  "last_started_at" timestamp with time zone,
  "last_completed_at" timestamp with time zone,
  "last_deleted_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "data_retention_policies_key_check"
    CHECK ("policy_key" in ('activity_logs', 'ai_audit_logs', 'ai_bot_webhook_events', 'request_error_logs')),
  CONSTRAINT "data_retention_policies_days_check"
    CHECK ("retention_days" between 7 and 3650),
  CONSTRAINT "data_retention_policies_deleted_count_check"
    CHECK ("last_deleted_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "data_retention_policies"
  ADD CONSTRAINT "data_retention_policies_updated_by_user_id_users_id_fk"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "data_retention_policies_key_unique"
  ON "data_retention_policies" ("policy_key");
--> statement-breakpoint
CREATE INDEX "ai_bot_webhook_events_terminal_created_idx"
  ON "ai_bot_webhook_events" ("created_at", "id")
  WHERE "status" in ('succeeded', 'failed');
--> statement-breakpoint
INSERT INTO "data_retention_policies" ("policy_key", "retention_days")
VALUES
  ('request_error_logs', 30),
  ('activity_logs', 365),
  ('ai_audit_logs', 365),
  ('ai_bot_webhook_events', 365);
