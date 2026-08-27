CREATE INDEX IF NOT EXISTS "ai_audit_logs_created_id_idx"
  ON "ai_audit_logs" ("created_at", "id");

CREATE INDEX IF NOT EXISTS "ai_tool_calls_failed_created_idx"
  ON "ai_tool_calls" ("created_at", "id")
  WHERE "status" = 'failed';

CREATE INDEX IF NOT EXISTS "ai_bot_webhook_events_failed_created_idx"
  ON "ai_bot_webhook_events" ("created_at", "id")
  WHERE "status" = 'failed';
