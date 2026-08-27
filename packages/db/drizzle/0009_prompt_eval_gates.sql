CREATE TABLE "ai_prompt_eval_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"definition_id" integer NOT NULL,
	"case_key" text NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"expected" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_eval_cases_key_check" CHECK ("ai_prompt_eval_cases"."case_key" ~ '^[a-z][a-z0-9._-]{2,79}$'),
	CONSTRAINT "ai_prompt_eval_cases_revision_check" CHECK ("ai_prompt_eval_cases"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_eval_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_version_id" integer NOT NULL,
	"suite_hash" text NOT NULL,
	"evaluator" text DEFAULT 'promptfoo' NOT NULL,
	"status" text NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_eval_runs_hash_check" CHECK ("ai_prompt_eval_runs"."suite_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ai_prompt_eval_runs_evaluator_check" CHECK (length(btrim("ai_prompt_eval_runs"."evaluator")) > 0),
	CONSTRAINT "ai_prompt_eval_runs_status_check" CHECK ("ai_prompt_eval_runs"."status" in ('passed', 'failed', 'error')),
	CONSTRAINT "ai_prompt_eval_runs_completion_check" CHECK ("ai_prompt_eval_runs"."completed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "ai_prompt_eval_cases" ADD CONSTRAINT "ai_prompt_eval_cases_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_prompt_eval_cases" ADD CONSTRAINT "ai_prompt_eval_cases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_prompt_eval_runs" ADD CONSTRAINT "ai_prompt_eval_runs_prompt_version_id_ai_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_prompt_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_prompt_eval_runs" ADD CONSTRAINT "ai_prompt_eval_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_eval_cases_definition_key_revision_unique" ON "ai_prompt_eval_cases" USING btree ("definition_id", "case_key", "revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_eval_cases_one_enabled_unique" ON "ai_prompt_eval_cases" USING btree ("definition_id", "case_key") WHERE "enabled" = true;
--> statement-breakpoint
CREATE INDEX "ai_prompt_eval_cases_definition_enabled_idx" ON "ai_prompt_eval_cases" USING btree ("definition_id", "enabled", "id");
--> statement-breakpoint
CREATE INDEX "ai_prompt_eval_runs_version_created_idx" ON "ai_prompt_eval_runs" USING btree ("prompt_version_id", "created_at", "id");
