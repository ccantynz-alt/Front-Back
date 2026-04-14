-- Webhook Deliveries table — every outbound webhook POST flows through
-- this queue. The dispatcher picks up pending rows whose next_retry_at is
-- due, POSTs them, and transitions them to delivered/failed.
CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
  `id` text PRIMARY KEY NOT NULL,
  `webhook_id` text NOT NULL,
  `event` text NOT NULL,
  `payload` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `last_status_code` integer,
  `next_retry_at` integer NOT NULL,
  `delivered_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`webhook_id`) REFERENCES `user_webhooks`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webhook_deliveries_status_idx` ON `webhook_deliveries` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webhook_deliveries_next_retry_at_idx` ON `webhook_deliveries` (`next_retry_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webhook_deliveries_webhook_id_idx` ON `webhook_deliveries` (`webhook_id`);
