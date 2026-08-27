ALTER TABLE "ai_usage_logs" ADD COLUMN "reserved_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "reservation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "reservation_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_reservation_check" CHECK ("ai_usage_logs"."reserved_tokens" >= 0 and ("ai_usage_logs"."reserved_tokens" = 0 or "ai_usage_logs"."reservation_expires_at" is not null));
