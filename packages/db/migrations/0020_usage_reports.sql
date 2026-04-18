-- BLK-010 Usage Reports — tracks what has already been pushed to Stripe
-- for each (userId, billingMonth, eventType). Enables idempotent, delta-
-- based usage reporting: the reporter compares the current aggregate in
-- usage_events against the reported_quantity here and pushes only the
-- delta to Stripe. Crashed or re-run reporters never double-bill.
--
-- See apps/api/src/billing/usage-reporter.ts for the writer and
-- packages/db/src/schema.ts (usageReports) for the Drizzle shape.

CREATE TABLE IF NOT EXISTS `usage_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `billing_month` text NOT NULL,
  `event_type` text NOT NULL,
  `reported_quantity` integer NOT NULL DEFAULT 0,
  `stripe_subscription_item_id` text NOT NULL,
  `last_stripe_usage_record_id` text,
  `last_reported_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `usage_reports_user_month_type_uniq` ON `usage_reports` (`user_id`,`billing_month`,`event_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_reports_last_reported_idx` ON `usage_reports` (`last_reported_at`);
