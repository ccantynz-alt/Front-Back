CREATE TABLE IF NOT EXISTS `feature_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`rollout_percent` integer DEFAULT 0 NOT NULL,
	`allow_list` text,
	`deny_list` text,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `feature_flags_name_unique` ON `feature_flags` (`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`weekly_digest` integer DEFAULT true NOT NULL,
	`collaboration_invite` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
