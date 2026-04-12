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
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_cache_tenant_idx` ON `ai_cache` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_cache_model_idx` ON `ai_cache` (`model`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_cache_expires_idx` ON `ai_cache` (`expires_at`);
