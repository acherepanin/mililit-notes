ALTER TABLE "ai_bot_pending_actions"
  ADD COLUMN "status" text DEFAULT 'pending' NOT NULL,
  ADD COLUMN "claimed_at" timestamp with time zone,
  ADD COLUMN "completed_at" timestamp with time zone,
  ADD COLUMN "response_text" text,
  ADD COLUMN "last_error" text,
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_bot_pending_actions"
  ADD CONSTRAINT "ai_bot_pending_actions_status_check"
  CHECK ("status" in ('pending', 'processing', 'succeeded', 'rejected', 'failed', 'expired'));
--> statement-breakpoint
CREATE INDEX "ai_bot_pending_actions_status_expires_idx"
  ON "ai_bot_pending_actions" ("status", "expires_at", "id");
