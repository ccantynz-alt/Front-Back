-- API Keys table
CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `key_hash` text NOT NULL,
  `prefix` text NOT NULL,
  `name` text NOT NULL,
  `last_used_at` integer,
  `expires_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_keys_user_id_idx` ON `api_keys` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_keys_key_hash_idx` ON `api_keys` (`key_hash`);
--> statement-breakpoint
-- User Webhooks table
CREATE TABLE IF NOT EXISTS `user_webhooks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `url` text NOT NULL,
  `events` text NOT NULL,
  `secret` text NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_webhooks_user_id_idx` ON `user_webhooks` (`user_id`);
