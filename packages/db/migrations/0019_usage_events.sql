-- BLK-010 Usage Metering — append-only per-user usage events that feed
-- Stripe's metered billing. See packages/db/src/schema.ts (usageEvents)
-- and apps/api/src/billing/usage-meter.ts for the writer + aggregator.

CREATE TABLE IF NOT EXISTS `usage_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `project_id` text,
  `event_type` text NOT NULL,
  `quantity` integer NOT NULL,
  `unit` text NOT NULL,
  `metadata` text,
  `occurred_at` integer NOT NULL,
  `billing_month` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_events_user_month_type_idx` ON `usage_events` (`user_id`,`billing_month`,`event_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_events_user_occurred_idx` ON `usage_events` (`user_id`,`occurred_at`);
