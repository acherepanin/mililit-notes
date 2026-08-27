ALTER TABLE "subscription_plans"
  ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'subscription_plans_revision_check'
       AND conrelid = 'subscription_plans'::regclass
  ) THEN
    ALTER TABLE "subscription_plans"
      ADD CONSTRAINT "subscription_plans_revision_check" CHECK ("revision" > 0);
  END IF;
END $$;
