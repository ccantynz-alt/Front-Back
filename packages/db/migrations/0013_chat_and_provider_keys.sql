CREATE TABLE IF NOT EXISTS `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `title` text NOT NULL,
  `model` text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
  `system_prompt` text,
  `total_tokens` integer DEFAULT 0 NOT NULL,
  `total_cost` integer DEFAULT 0 NOT NULL,
  `archived` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversations_user_id_idx` ON `conversations` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversations_updated_at_idx` ON `conversations` (`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `model` text,
  `input_tokens` integer,
  `output_tokens` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_messages_conversation_id_idx` ON `chat_messages` (`conversation_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_provider_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `encrypted_key` text NOT NULL,
  `key_prefix` text NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `last_used_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_provider_keys_user_provider_idx` ON `user_provider_keys` (`user_id`, `provider`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_cache` (
  `cache_key` text PRIMARY KEY NOT NULL,
  `tenant_id` text,
  `model` text NOT NULL,
  `prompt_hash` text NOT NULL,
  `response_json` text NOT NULL,
  `tokens_used` integer DEFAULT 0 NOT NULL,
  `cost_usd` integer DEFAULT 0 NOT NULL,
  `hit_count` integer DEFAULT 0 NOT NULL,
  `last_hit_at` integer,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_cache_tenant_idx` ON `ai_cache` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_cache_expires_idx` ON `ai_cache` (`expires_at`);
