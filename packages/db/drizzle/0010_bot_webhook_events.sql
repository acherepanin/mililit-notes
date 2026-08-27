DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM ai_bot_user_settings
     WHERE linked_external_id IS NOT NULL
     GROUP BY provider, linked_external_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique bot identity: duplicate provider/external account links exist';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_bot_user_settings_provider_external_unique"
  ON "ai_bot_user_settings" ("provider", "linked_external_id")
  WHERE "linked_external_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "ai_bot_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "external_id" text,
  "payload_hash" text NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL,
  "correlation_id" text NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_bot_webhook_events_provider_check" CHECK ("provider" in ('telegram', 'vk')),
  CONSTRAINT "ai_bot_webhook_events_status_check" CHECK ("status" in ('received', 'processing', 'succeeded', 'failed')),
  CONSTRAINT "ai_bot_webhook_events_attempts_check" CHECK ("attempts" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_bot_webhook_events_provider_event_unique"
  ON "ai_bot_webhook_events" ("provider", "event_id");
--> statement-breakpoint
CREATE INDEX "ai_bot_webhook_events_status_available_idx"
  ON "ai_bot_webhook_events" ("status", "available_at", "id");
--> statement-breakpoint
CREATE INDEX "ai_bot_webhook_events_external_idx"
  ON "ai_bot_webhook_events" ("provider", "external_id", "created_at");
