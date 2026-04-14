CREATE TABLE IF NOT EXISTS `sites` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sites_slug_unique` ON `sites` (`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sites_user_id_idx` ON `sites` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sites_status_idx` ON `sites` (`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `site_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `version` integer NOT NULL,
  `prompt` text,
  `layout` text NOT NULL,
  `generated_by` text DEFAULT 'ai' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `site_versions_site_id_idx` ON `site_versions` (`site_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `site_versions_site_id_version_idx` ON `site_versions` (`site_id`, `version`);
