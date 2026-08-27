CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"external_thread_id" text,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"model_role" text DEFAULT 'chat' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_conversations_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "ai_conversations_channel_check" CHECK ("ai_conversations"."channel" in ('web', 'telegram', 'vk', 'api')),
	CONSTRAINT "ai_conversations_status_check" CHECK ("ai_conversations"."status" in ('active', 'archived')),
	CONSTRAINT "ai_conversations_model_role_check" CHECK ("ai_conversations"."model_role" in ('fast', 'chat', 'reasoning', 'vision', 'voice'))
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"provider_name" text,
	"model" text,
	"prompt_version_id" integer,
	"provider_response_id" text,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_messages_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "ai_messages_sequence_check" CHECK ("ai_messages"."sequence" > 0),
	CONSTRAINT "ai_messages_role_check" CHECK ("ai_messages"."role" in ('user', 'assistant', 'system', 'tool')),
	CONSTRAINT "ai_messages_status_check" CHECK ("ai_messages"."status" in ('pending', 'streaming', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "ai_model_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"provider_setting_id" integer,
	"model" text NOT NULL,
	"reasoning_effort" text DEFAULT 'none' NOT NULL,
	"temperature" numeric(4, 3),
	"max_output_tokens" integer,
	"fallback_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_routes_role_check" CHECK ("ai_model_routes"."role" in ('fast', 'chat', 'reasoning', 'vision', 'voice', 'transcription', 'speech', 'embedding')),
	CONSTRAINT "ai_model_routes_reasoning_effort_check" CHECK ("ai_model_routes"."reasoning_effort" in ('none', 'low', 'medium', 'high', 'xhigh')),
	CONSTRAINT "ai_model_routes_temperature_check" CHECK ("ai_model_routes"."temperature" is null or "ai_model_routes"."temperature" between 0 and 2),
	CONSTRAINT "ai_model_routes_max_output_tokens_check" CHECK ("ai_model_routes"."max_output_tokens" is null or "ai_model_routes"."max_output_tokens" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"origin" text DEFAULT 'admin' NOT NULL,
	"security_policy_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_definitions_key_check" CHECK ("ai_prompt_definitions"."prompt_key" ~ '^[a-z][a-z0-9._-]{2,79}$'),
	CONSTRAINT "ai_prompt_definitions_origin_check" CHECK ("ai_prompt_definitions"."origin" in ('system', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"definition_id" integer NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" text NOT NULL,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_role" text DEFAULT 'chat' NOT NULL,
	"reasoning_effort" text DEFAULT 'none' NOT NULL,
	"tool_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retry_limit" integer DEFAULT 0 NOT NULL,
	"stop_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_summary" text,
	"created_by_user_id" integer,
	"reviewed_by_user_id" integer,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_versions_version_check" CHECK ("ai_prompt_versions"."version" > 0),
	CONSTRAINT "ai_prompt_versions_status_check" CHECK ("ai_prompt_versions"."status" in ('draft', 'review', 'active', 'archived')),
	CONSTRAINT "ai_prompt_versions_content_check" CHECK (length(btrim("ai_prompt_versions"."content")) > 0),
	CONSTRAINT "ai_prompt_versions_model_role_check" CHECK ("ai_prompt_versions"."model_role" in ('fast', 'chat', 'reasoning', 'vision', 'voice')),
	CONSTRAINT "ai_prompt_versions_reasoning_effort_check" CHECK ("ai_prompt_versions"."reasoning_effort" in ('none', 'low', 'medium', 'high', 'xhigh')),
	CONSTRAINT "ai_prompt_versions_retry_limit_check" CHECK ("ai_prompt_versions"."retry_limit" between 0 and 5),
	CONSTRAINT "ai_prompt_versions_activation_check" CHECK ("ai_prompt_versions"."status" <> 'active' or "ai_prompt_versions"."activated_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tool_name" text NOT NULL,
	"risk_class" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"arguments_hash" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	"error_code" text,
	"idempotency_key" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_calls_id_user_arguments_unique" UNIQUE("id","user_id","arguments_hash"),
	CONSTRAINT "ai_tool_calls_risk_class_check" CHECK ("ai_tool_calls"."risk_class" in ('read_only', 'reversible_write', 'destructive', 'external', 'costly')),
	CONSTRAINT "ai_tool_calls_status_check" CHECK ("ai_tool_calls"."status" in ('requested', 'awaiting_confirmation', 'approved', 'executing', 'succeeded', 'failed', 'rejected', 'expired', 'cancelled')),
	CONSTRAINT "ai_tool_calls_arguments_hash_check" CHECK ("ai_tool_calls"."arguments_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_tool_calls_confirmation_state_check" CHECK (not "ai_tool_calls"."requires_confirmation" or "ai_tool_calls"."status" <> 'requested')
);
--> statement-breakpoint
CREATE TABLE "ai_tool_confirmations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tool_call_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"arguments_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_confirmations_status_check" CHECK ("ai_tool_confirmations"."status" in ('pending', 'approved', 'rejected', 'consumed', 'expired')),
	CONSTRAINT "ai_tool_confirmations_arguments_hash_check" CHECK ("ai_tool_confirmations"."arguments_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_tool_confirmations_token_hash_check" CHECK ("ai_tool_confirmations"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_tool_confirmations_expiry_check" CHECK ("ai_tool_confirmations"."expires_at" > "ai_tool_confirmations"."created_at"),
	CONSTRAINT "ai_tool_confirmations_decision_check" CHECK ("ai_tool_confirmations"."status" in ('pending', 'expired') or "ai_tool_confirmations"."decided_at" is not null),
	CONSTRAINT "ai_tool_confirmations_consumption_check" CHECK ("ai_tool_confirmations"."status" <> 'consumed' or "ai_tool_confirmations"."consumed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "conversation_id" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "message_id" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "prompt_version_id" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "request_kind" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "status" text DEFAULT 'succeeded' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "cached_input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "reasoning_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "input_audio_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "output_audio_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "tool_call_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "time_to_first_token_ms" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "input_cost" numeric(18, 8) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "cached_input_cost" numeric(18, 8) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "output_cost" numeric(18, 8) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "total_cost" numeric(18, 8) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_prompt_version_id_ai_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_user_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."ai_conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_routes" ADD CONSTRAINT "ai_model_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_routes" ADD CONSTRAINT "ai_model_routes_provider_setting_id_ai_provider_settings_id_fk" FOREIGN KEY ("provider_setting_id") REFERENCES "public"."ai_provider_settings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_definitions" ADD CONSTRAINT "ai_prompt_definitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_message_user_fk" FOREIGN KEY ("message_id","user_id") REFERENCES "public"."ai_messages"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_confirmations" ADD CONSTRAINT "ai_tool_confirmations_exact_call_fk" FOREIGN KEY ("tool_call_id","user_id","arguments_hash") REFERENCES "public"."ai_tool_calls"("id","user_id","arguments_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_conversations_external_thread_unique" ON "ai_conversations" USING btree ("user_id","channel","external_thread_id") WHERE "ai_conversations"."external_thread_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_conversations_user_status_updated_idx" ON "ai_conversations" USING btree ("user_id","status","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_messages_conversation_sequence_unique" ON "ai_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "ai_messages_user_created_idx" ON "ai_messages" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_routes_user_role_unique" ON "ai_model_routes" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "ai_model_routes_provider_idx" ON "ai_model_routes" USING btree ("provider_setting_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_definitions_key_unique" ON "ai_prompt_definitions" USING btree (lower("prompt_key"));--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_versions_definition_version_unique" ON "ai_prompt_versions" USING btree ("definition_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_versions_one_active_unique" ON "ai_prompt_versions" USING btree ("definition_id") WHERE "ai_prompt_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ai_prompt_versions_definition_status_idx" ON "ai_prompt_versions" USING btree ("definition_id","status","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_calls_user_idempotency_unique" ON "ai_tool_calls" USING btree ("user_id","idempotency_key") WHERE "ai_tool_calls"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "ai_tool_calls_message_status_idx" ON "ai_tool_calls" USING btree ("message_id","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_confirmations_tool_call_unique" ON "ai_tool_confirmations" USING btree ("tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_confirmations_token_hash_unique" ON "ai_tool_confirmations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ai_tool_confirmations_user_status_expiry_idx" ON "ai_tool_confirmations" USING btree ("user_id","status","expires_at","id");--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_prompt_version_id_ai_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_logs_user_request_unique" ON "ai_usage_logs" USING btree ("user_id","request_id") WHERE "ai_usage_logs"."request_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_usage_logs_conversation_created_idx" ON "ai_usage_logs" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_provider_request_idx" ON "ai_usage_logs" USING btree ("provider_name","provider_request_id");--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_token_details_check" CHECK ("ai_usage_logs"."cached_input_tokens" >= 0 and "ai_usage_logs"."reasoning_tokens" >= 0 and "ai_usage_logs"."input_audio_tokens" >= 0 and "ai_usage_logs"."output_audio_tokens" >= 0 and "ai_usage_logs"."tool_call_count" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_request_kind_check" CHECK ("ai_usage_logs"."request_kind" in ('chat', 'response', 'embedding', 'transcription', 'speech', 'realtime', 'moderation'));--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_status_check" CHECK ("ai_usage_logs"."status" in ('started', 'streaming', 'succeeded', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_latency_check" CHECK (coalesce("ai_usage_logs"."latency_ms", 0) >= 0 and coalesce("ai_usage_logs"."time_to_first_token_ms", 0) >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_cost_check" CHECK ("ai_usage_logs"."input_cost" >= 0 and "ai_usage_logs"."cached_input_cost" >= 0 and "ai_usage_logs"."output_cost" >= 0 and "ai_usage_logs"."total_cost" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_currency_check" CHECK ("ai_usage_logs"."currency" ~ '^[A-Z]{3}$');
