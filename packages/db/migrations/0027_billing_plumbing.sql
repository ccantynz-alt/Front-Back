-- BLK-010: Stripe metered billing — plumbing only, no pricing values.
-- Additive migration. All statements use IF NOT EXISTS so a partially-applied
-- DB can re-run cleanly. Statement breakpoints are MANDATORY (see CLAUDE.md §0.4.1 rule 6).

CREATE TABLE IF NOT EXISTS `billing_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `stripe_customer_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `billing_accounts_stripe_customer_id_unique` ON `billing_accounts` (`stripe_customer_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `billing_accounts_user_idx` ON `billing_accounts` (`user_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `billing_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `stripe_event_id` text NOT NULL,
  `event_type` text NOT NULL,
  `payload_json` text NOT NULL,
  `received_at` integer NOT NULL,
  `processed_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `billing_events_stripe_event_id_unique` ON `billing_events` (`stripe_event_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `billing_events_user_idx` ON `billing_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `billing_events_type_idx` ON `billing_events` (`event_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `billing_events_received_idx` ON `billing_events` (`received_at`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `build_minutes_usage` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `deployment_id` text NOT NULL,
  `minutes_used` real NOT NULL,
  `recorded_at` integer NOT NULL,
  `reported_to_stripe_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_minutes_usage_user_idx` ON `build_minutes_usage` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_minutes_usage_deployment_idx` ON `build_minutes_usage` (`deployment_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_minutes_usage_recorded_idx` ON `build_minutes_usage` (`recorded_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_minutes_usage_unreported_idx` ON `build_minutes_usage` (`reported_to_stripe_at`);
