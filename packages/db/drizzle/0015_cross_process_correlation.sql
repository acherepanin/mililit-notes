ALTER TABLE "ai_tool_calls"
  ADD COLUMN "correlation_id" text;
--> statement-breakpoint
CREATE INDEX "ai_tool_calls_correlation_idx"
  ON "ai_tool_calls" ("correlation_id", "created_at", "id")
  WHERE "correlation_id" is not null;
