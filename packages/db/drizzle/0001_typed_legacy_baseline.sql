CREATE TABLE "ai_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_bot_admin_settings" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"bot_token_encrypted" text,
	"access_token_encrypted" text,
	"secret_encrypted" text,
	"group_id" text,
	"confirmation_code" text,
	"allow_secrets" boolean DEFAULT false NOT NULL,
	"require_confirmation" boolean DEFAULT true NOT NULL,
	"daily_request_limit" integer,
	"daily_read_limit" integer,
	"daily_write_limit" integer,
	"last_check_at" timestamp with time zone,
	"last_check_status" text,
	"last_check_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_bot_admin_settings_provider_check" CHECK ("ai_bot_admin_settings"."provider" in ('telegram', 'vk')),
	CONSTRAINT "ai_bot_admin_settings_limits_check" CHECK (coalesce("ai_bot_admin_settings"."daily_request_limit", 1) > 0 and coalesce("ai_bot_admin_settings"."daily_read_limit", 1) > 0 and coalesce("ai_bot_admin_settings"."daily_write_limit", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_bot_link_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_bot_link_codes_provider_check" CHECK ("ai_bot_link_codes"."provider" in ('telegram', 'vk'))
);
--> statement-breakpoint
CREATE TABLE "ai_bot_pending_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"action_name" text NOT NULL,
	"action_payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_bot_pending_actions_provider_check" CHECK ("ai_bot_pending_actions"."provider" in ('telegram', 'vk'))
);
--> statement-breakpoint
CREATE TABLE "ai_bot_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"action_name" text,
	"usage_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_bot_usage_logs_provider_check" CHECK ("ai_bot_usage_logs"."provider" in ('telegram', 'vk')),
	CONSTRAINT "ai_bot_usage_logs_kind_check" CHECK ("ai_bot_usage_logs"."kind" in ('message', 'read', 'write')),
	CONSTRAINT "ai_bot_usage_logs_count_check" CHECK ("ai_bot_usage_logs"."usage_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_bot_user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"access_mode" text DEFAULT 'read' NOT NULL,
	"allow_secrets" boolean DEFAULT false NOT NULL,
	"allow_note_read" boolean DEFAULT true NOT NULL,
	"allow_note_write" boolean DEFAULT false NOT NULL,
	"allow_note_delete" boolean DEFAULT false NOT NULL,
	"allow_tags" boolean DEFAULT false NOT NULL,
	"allow_templates" boolean DEFAULT false NOT NULL,
	"allow_versions" boolean DEFAULT false NOT NULL,
	"allow_attachments" boolean DEFAULT false NOT NULL,
	"allow_share_links" boolean DEFAULT false NOT NULL,
	"daily_request_limit" integer,
	"daily_read_limit" integer,
	"daily_write_limit" integer,
	"linked_external_id" text,
	"linked_username" text,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_bot_user_settings_provider_check" CHECK ("ai_bot_user_settings"."provider" in ('telegram', 'vk')),
	CONSTRAINT "ai_bot_user_settings_access_mode_check" CHECK ("ai_bot_user_settings"."access_mode" in ('read', 'write')),
	CONSTRAINT "ai_bot_user_settings_limits_check" CHECK (coalesce("ai_bot_user_settings"."daily_request_limit", 1) > 0 and coalesce("ai_bot_user_settings"."daily_read_limit", 1) > 0 and coalesce("ai_bot_user_settings"."daily_write_limit", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_model_catalog" (
	"model_id" text PRIMARY KEY NOT NULL,
	"label" text,
	"tier" text DEFAULT 'unknown' NOT NULL,
	"quality" text DEFAULT 'unknown' NOT NULL,
	"speed" text DEFAULT 'unknown' NOT NULL,
	"cost" text DEFAULT 'unknown' NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"speed_score" integer DEFAULT 50 NOT NULL,
	"value_score" integer DEFAULT 50 NOT NULL,
	"sort_rank" integer DEFAULT 0 NOT NULL,
	"input_price_per_1m" numeric(18, 8),
	"cached_input_price_per_1m" numeric(18, 8),
	"output_price_per_1m" numeric(18, 8),
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'builtin' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_catalog_scores_check" CHECK ("ai_model_catalog"."score" between 0 and 100 and "ai_model_catalog"."speed_score" between 0 and 100 and "ai_model_catalog"."value_score" between 0 and 100),
	CONSTRAINT "ai_model_catalog_prices_check" CHECK (coalesce("ai_model_catalog"."input_price_per_1m", 0) >= 0 and coalesce("ai_model_catalog"."cached_input_price_per_1m", 0) >= 0 and coalesce("ai_model_catalog"."output_price_per_1m", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_note_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"note_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"model_id" text NOT NULL,
	"label" text NOT NULL,
	"tier" text DEFAULT 'unknown' NOT NULL,
	"quality" text DEFAULT 'unknown' NOT NULL,
	"speed" text DEFAULT 'unknown' NOT NULL,
	"cost" text DEFAULT 'unknown' NOT NULL,
	"input_price_per_1m" numeric(18, 8),
	"cached_input_price_per_1m" numeric(18, 8),
	"output_price_per_1m" numeric(18, 8),
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"provider_created_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_models_prices_check" CHECK (coalesce("ai_provider_models"."input_price_per_1m", 0) >= 0 and coalesce("ai_provider_models"."cached_input_price_per_1m", 0) >= 0 and coalesce("ai_provider_models"."output_price_per_1m", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_provider_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text,
	"api_key_encrypted" text,
	"api_key_hint" text,
	"api_key_updated_at" timestamp with time zone,
	"last_connection_check_at" timestamp with time zone,
	"last_connection_check_status" text,
	"last_models_sync_at" timestamp with time zone,
	"models_sync_status" text,
	"models_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_logs_input_check" CHECK ("ai_usage_logs"."input_tokens" >= 0),
	CONSTRAINT "ai_usage_logs_output_check" CHECK ("ai_usage_logs"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allow_read_secrets" boolean DEFAULT false NOT NULL,
	"require_action_confirmation" boolean DEFAULT true NOT NULL,
	"daily_request_limit" integer,
	"daily_token_limit" integer,
	"provider_name" text DEFAULT 'OpenAI-compatible' NOT NULL,
	"base_url" text DEFAULT 'https://api.openai.com/v1' NOT NULL,
	"model" text,
	"api_key_encrypted" text,
	"api_key_hint" text,
	"api_key_updated_at" timestamp with time zone,
	"last_connection_check_at" timestamp with time zone,
	"last_connection_check_status" text,
	"last_models_sync_at" timestamp with time zone,
	"models_sync_status" text,
	"models_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_user_settings_daily_request_limit_check" CHECK ("ai_user_settings"."daily_request_limit" is null or "ai_user_settings"."daily_request_limit" > 0),
	CONSTRAINT "ai_user_settings_daily_token_limit_check" CHECK ("ai_user_settings"."daily_token_limit" is null or "ai_user_settings"."daily_token_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'rub' NOT NULL,
	"payment_provider" text DEFAULT 'mock' NOT NULL,
	"payment_external_id" text,
	"paid_at" timestamp with time zone,
	"term_months" integer DEFAULT 1 NOT NULL,
	"checkout_mode" text DEFAULT 'purchase' NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_orders_status_check" CHECK ("subscription_orders"."status" in ('pending', 'paid', 'cancelled', 'failed', 'refunded')),
	CONSTRAINT "subscription_orders_amount_check" CHECK ("subscription_orders"."amount_cents" >= 0),
	CONSTRAINT "subscription_orders_term_check" CHECK ("subscription_orders"."term_months" > 0),
	CONSTRAINT "subscription_orders_discount_check" CHECK ("subscription_orders"."discount_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'rub' NOT NULL,
	"billing_period" text DEFAULT 'month' NOT NULL,
	"entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"icon_key" text DEFAULT 'package' NOT NULL,
	"card_color" text DEFAULT 'sky' NOT NULL,
	"card_art" text DEFAULT 'bubbles' NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_price_check" CHECK ("subscription_plans"."price_cents" >= 0),
	CONSTRAINT "subscription_plans_billing_period_check" CHECK ("subscription_plans"."billing_period" in ('month', 'year', 'lifetime'))
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"source" text DEFAULT 'migration' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_status_check" CHECK ("user_subscriptions"."status" in ('active', 'cancelled', 'expired', 'pending')),
	CONSTRAINT "user_subscriptions_dates_check" CHECK ("user_subscriptions"."expires_at" is null or "user_subscriptions"."expires_at" >= "user_subscriptions"."started_at")
);
--> statement-breakpoint
CREATE TABLE "pending_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_registrations_id_check" CHECK ("pending_registrations"."id" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"language" text DEFAULT 'ru' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"patronymic" text,
	"birth_date" date,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin')),
	CONSTRAINT "users_language_check" CHECK ("users"."language" in ('ru', 'en')),
	CONSTRAINT "users_theme_check" CHECK ("users"."theme" in ('dark', 'light', 'system'))
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"user_id" integer,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"message" text,
	"error_name" text,
	"error_body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_error_logs_status_code_check" CHECK ("request_error_logs"."status_code" between 400 and 599),
	CONSTRAINT "request_error_logs_duration_check" CHECK ("request_error_logs"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "share_link_access_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"share_link_id" integer NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" "inet"
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"public_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"include_secrets" boolean DEFAULT false NOT NULL,
	"max_access_count" integer,
	"access_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone,
	CONSTRAINT "share_links_access_count_check" CHECK ("share_links"."access_count" >= 0),
	CONSTRAINT "share_links_max_access_count_check" CHECK ("share_links"."max_access_count" is null or "share_links"."max_access_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "attachment_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_folders_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "attachment_folders_parent_check" CHECK ("attachment_folders"."parent_id" is null or "attachment_folders"."parent_id" <> "attachment_folders"."id"),
	CONSTRAINT "attachment_folders_position_check" CHECK ("attachment_folders"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"note_id" integer,
	"folder_id" integer,
	"file_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"detected_mime_type" text,
	"size_bytes" bigint NOT NULL,
	"legacy_storage_path" text,
	"object_key" text,
	"checksum_sha256" text,
	"etag" text,
	"storage_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_size_bytes_check" CHECK ("attachments"."size_bytes" >= 0),
	CONSTRAINT "attachments_storage_status_check" CHECK ("attachments"."storage_status" in ('pending', 'copying', 'ready', 'failed', 'deleted')),
	CONSTRAINT "attachments_storage_location_check" CHECK ("attachments"."legacy_storage_path" is not null or "attachments"."object_key" is not null)
);
--> statement-breakpoint
CREATE TABLE "note_tags" (
	"user_id" integer NOT NULL,
	"note_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_tags_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "note_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_templates_owner_check" CHECK (("note_templates"."is_system" and "note_templates"."user_id" is null) or (not "note_templates"."is_system" and "note_templates"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "note_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"parent_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" integer,
	"delete_reason" text,
	"attachment_folder_id" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "notes_parent_check" CHECK ("notes"."parent_id" is null or "notes"."parent_id" <> "notes"."id"),
	CONSTRAINT "notes_position_check" CHECK ("notes"."position" >= 0),
	CONSTRAINT "notes_revision_check" CHECK ("notes"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ai_audit_logs" ADD CONSTRAINT "ai_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_bot_link_codes" ADD CONSTRAINT "ai_bot_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_bot_pending_actions" ADD CONSTRAINT "ai_bot_pending_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_bot_usage_logs" ADD CONSTRAINT "ai_bot_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_bot_user_settings" ADD CONSTRAINT "ai_bot_user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_note_embeddings" ADD CONSTRAINT "ai_note_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_note_embeddings" ADD CONSTRAINT "ai_note_embeddings_note_user_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_models" ADD CONSTRAINT "ai_provider_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_settings" ADD CONSTRAINT "ai_user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_error_logs" ADD CONSTRAINT "request_error_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link_access_logs" ADD CONSTRAINT "share_link_access_logs_share_link_id_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_note_user_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_folders" ADD CONSTRAINT "attachment_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_folders" ADD CONSTRAINT "attachment_folders_parent_user_fk" FOREIGN KEY ("parent_id","user_id") REFERENCES "public"."attachment_folders"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_folder_id_attachment_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."attachment_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_user_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_user_fk" FOREIGN KEY ("tag_id","user_id") REFERENCES "public"."tags"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_note_user_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_attachment_folder_id_attachment_folders_id_fk" FOREIGN KEY ("attachment_folder_id") REFERENCES "public"."attachment_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_user_fk" FOREIGN KEY ("parent_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_audit_logs_user_created_idx" ON "ai_audit_logs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_bot_link_codes_hash_unique" ON "ai_bot_link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "ai_bot_link_codes_user_provider_expires_idx" ON "ai_bot_link_codes" USING btree ("user_id","provider","expires_at","id");--> statement-breakpoint
CREATE INDEX "ai_bot_pending_actions_scope_expires_idx" ON "ai_bot_pending_actions" USING btree ("user_id","provider","external_id","expires_at","id");--> statement-breakpoint
CREATE INDEX "ai_bot_usage_logs_user_scope_created_idx" ON "ai_bot_usage_logs" USING btree ("user_id","provider","kind","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_bot_usage_logs_created_scope_idx" ON "ai_bot_usage_logs" USING btree ("created_at","provider","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_bot_user_settings_user_provider_unique" ON "ai_bot_user_settings" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "ai_bot_user_settings_provider_external_idx" ON "ai_bot_user_settings" USING btree ("provider","linked_external_id");--> statement-breakpoint
CREATE INDEX "ai_model_catalog_rank_idx" ON "ai_model_catalog" USING btree ("is_deprecated","sort_rank","model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_note_embeddings_scope_unique" ON "ai_note_embeddings" USING btree ("user_id","note_id","provider_name","base_url","model");--> statement-breakpoint
CREATE INDEX "ai_note_embeddings_user_model_idx" ON "ai_note_embeddings" USING btree ("user_id","provider_name","model");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_models_user_provider_model_unique" ON "ai_provider_models" USING btree ("user_id","provider_name","model_id");--> statement-breakpoint
CREATE INDEX "ai_provider_models_user_seen_idx" ON "ai_provider_models" USING btree ("user_id","last_seen_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_settings_user_provider_url_unique" ON "ai_provider_settings" USING btree ("user_id","provider_name","base_url");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_user_created_idx" ON "ai_usage_logs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_created_user_model_idx" ON "ai_usage_logs" USING btree ("created_at","user_id","provider_name","model");--> statement-breakpoint
CREATE INDEX "subscription_orders_user_created_idx" ON "subscription_orders" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "subscription_orders_provider_external_idx" ON "subscription_orders" USING btree ("payment_provider","payment_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_slug_unique" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "subscription_plans_visible_order_idx" ON "subscription_plans" USING btree ("is_active","is_hidden","sort_order","id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_user_status_idx" ON "user_subscriptions" USING btree ("user_id","status","expires_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_registrations_token_hash_unique" ON "pending_registrations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "pending_registrations_expires_at_idx" ON "pending_registrations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "pending_registrations_username_idx" ON "pending_registrations" USING btree ("username");--> statement-breakpoint
CREATE INDEX "pending_registrations_email_idx" ON "pending_registrations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "activity_logs_created_id_idx" ON "activity_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "activity_logs_actor_created_idx" ON "activity_logs" USING btree ("actor_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activity_logs_user_created_idx" ON "activity_logs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activity_logs_action_created_idx" ON "activity_logs" USING btree ("action","created_at","id");--> statement-breakpoint
CREATE INDEX "request_error_logs_created_id_idx" ON "request_error_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "request_error_logs_status_created_idx" ON "request_error_logs" USING btree ("status_code","created_at","id");--> statement-breakpoint
CREATE INDEX "request_error_logs_user_created_idx" ON "request_error_logs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "share_link_access_logs_link_accessed_idx" ON "share_link_access_logs" USING btree ("share_link_id","accessed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_hash_unique" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "share_links_note_created_idx" ON "share_links" USING btree ("note_id","created_at");--> statement-breakpoint
CREATE INDEX "share_links_active_idx" ON "share_links" USING btree ("revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "attachment_folders_user_parent_position_idx" ON "attachment_folders" USING btree ("user_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "attachments_user_created_idx" ON "attachments" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "attachments_user_folder_created_idx" ON "attachments" USING btree ("user_id","folder_id","created_at","id");--> statement-breakpoint
CREATE INDEX "attachments_user_note_created_idx" ON "attachments" USING btree ("user_id","note_id","created_at","id");--> statement-breakpoint
CREATE INDEX "attachments_user_checksum_idx" ON "attachments" USING btree ("user_id","checksum_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_object_key_unique" ON "attachments" USING btree ("object_key") WHERE "attachments"."object_key" is not null;--> statement-breakpoint
CREATE INDEX "note_tags_user_tag_note_idx" ON "note_tags" USING btree ("user_id","tag_id","note_id");--> statement-breakpoint
CREATE INDEX "note_templates_user_system_idx" ON "note_templates" USING btree ("user_id","is_system","name");--> statement-breakpoint
CREATE INDEX "note_versions_note_created_id_idx" ON "note_versions" USING btree ("note_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notes_user_parent_position_idx" ON "notes" USING btree ("user_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "notes_user_deleted_updated_idx" ON "notes" USING btree ("user_id","deleted_at","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_unique" ON "tags" USING btree ("user_id","name");