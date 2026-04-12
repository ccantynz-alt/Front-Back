-- feature_flags already created by 0005_wave1_hooks; IF NOT EXISTS is a no-op.
CREATE TABLE IF NOT EXISTS `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`description` text,
	`rollout_percentage` integer DEFAULT 0 NOT NULL,
	`allow_list` text DEFAULT '[]' NOT NULL,
	`deny_list` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`weekly_digest` integer DEFAULT true NOT NULL,
	`collaboration_invite` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `email_preferences_user_id_unique` ON `email_preferences` (`user_id`);
