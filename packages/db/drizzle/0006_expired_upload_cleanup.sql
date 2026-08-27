ALTER TABLE "attachment_uploads" DROP CONSTRAINT "attachment_uploads_status_check";--> statement-breakpoint
CREATE INDEX "attachment_uploads_expiry_cleanup_idx" ON "attachment_uploads" USING btree ("expires_at","id") WHERE "attachment_uploads"."status" in ('preparing', 'uploading', 'completing');--> statement-breakpoint
CREATE INDEX "attachment_uploads_expiring_retry_idx" ON "attachment_uploads" USING btree ("updated_at","id") WHERE "attachment_uploads"."status" = 'expiring';--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_status_check" CHECK ("attachment_uploads"."status" in ('preparing', 'uploading', 'completing', 'expiring', 'expired', 'completed', 'aborted', 'failed'));
