-- BLK-030 Native SMS (Sinch-backed) send/receive infrastructure.
-- Three tables cover the scope:
--   • `sms_messages` — append-only log of inbound + outbound SMS. Cost
--     + markup live in microdollars so revenue can be totalled without
--     float drift. `segments` matches the billable part count Sinch
--     charges per message (long bodies + non-GSM7 chars raise it).
--   • `sms_numbers` — MSISDN pool each customer has leased. Soft-delete
--     via `released_at` so we retain purchase history for accounting.
--   • `sms_webhook_subscriptions` — per-number customer webhook config.
--     The inbound handler fans out to these via the existing webhook
--     engine so retry + delivery guarantees are inherited for free.
-- Additive only: no existing tables or columns are touched or dropped.
--
-- See packages/db/src/schema.ts (smsMessages / smsNumbers /
-- smsWebhookSubscriptions) for the Drizzle shape and
-- apps/api/src/trpc/procedures/sms.ts for the router that writes them.

CREATE TABLE IF NOT EXISTS `sms_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `direction` text NOT NULL,
  `from_number` text NOT NULL,
  `to_number` text NOT NULL,
  `body` text NOT NULL,
  `segments` integer DEFAULT 1 NOT NULL,
  `status` text NOT NULL,
  `provider_message_id` text,
  `cost_microdollars` integer DEFAULT 0 NOT NULL,
  `markup_microdollars` integer DEFAULT 0 NOT NULL,
  `error_code` text,
  `error_message` text,
  `sent_at` integer,
  `delivered_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_messages_user_idx` ON `sms_messages` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_messages_status_idx` ON `sms_messages` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_messages_provider_idx` ON `sms_messages` (`provider_message_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_messages_created_idx` ON `sms_messages` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sms_numbers` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `e164_number` text NOT NULL,
  `country_code` text NOT NULL,
  `sinch_number_id` text NOT NULL,
  `capabilities` text DEFAULT '["sms"]' NOT NULL,
  `monthly_cost_microdollars` integer DEFAULT 0 NOT NULL,
  `purchased_at` integer NOT NULL,
  `released_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sms_numbers_e164_unique` ON `sms_numbers` (`e164_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_numbers_user_idx` ON `sms_numbers` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_numbers_released_idx` ON `sms_numbers` (`released_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sms_webhook_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `e164_number` text NOT NULL,
  `customer_webhook_url` text NOT NULL,
  `hmac_secret` text NOT NULL,
  `events` text DEFAULT '["inbound"]' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_webhook_sub_user_idx` ON `sms_webhook_subscriptions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sms_webhook_sub_number_idx` ON `sms_webhook_subscriptions` (`e164_number`);
