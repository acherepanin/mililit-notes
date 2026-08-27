CREATE TABLE "attachment_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"note_id" integer,
	"folder_id" integer,
	"file_name" text NOT NULL,
	"declared_mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text,
	"object_key" text NOT NULL,
	"multipart_upload_id" text NOT NULL,
	"part_size_bytes" bigint NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_uploads_size_check" CHECK ("attachment_uploads"."size_bytes" > 0),
	CONSTRAINT "attachment_uploads_part_size_check" CHECK ("attachment_uploads"."part_size_bytes" between 5242880 and 5368709120),
	CONSTRAINT "attachment_uploads_status_check" CHECK ("attachment_uploads"."status" in ('uploading', 'completing', 'completed', 'aborted', 'failed')),
	CONSTRAINT "attachment_uploads_checksum_check" CHECK ("attachment_uploads"."checksum_sha256" is null or "attachment_uploads"."checksum_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_note_user_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."notes"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_folder_user_fk" FOREIGN KEY ("folder_id","user_id") REFERENCES "public"."attachment_folders"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_uploads_object_key_unique" ON "attachment_uploads" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "attachment_uploads_user_status_expiry_idx" ON "attachment_uploads" USING btree ("user_id","status","expires_at","id");