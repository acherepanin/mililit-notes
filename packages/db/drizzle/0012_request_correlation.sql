ALTER TABLE "request_error_logs"
  ADD COLUMN "correlation_id" text;
--> statement-breakpoint
CREATE INDEX "request_error_logs_correlation_idx"
  ON "request_error_logs" ("correlation_id", "created_at", "id");
