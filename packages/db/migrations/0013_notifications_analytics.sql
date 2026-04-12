CREATE TABLE IF NOT EXISTS `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `message` text NOT NULL,
  `read` integer DEFAULT false NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_id_idx` ON `notifications` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_read_idx` ON `notifications` (`read`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `analytics_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `session_id` text,
  `event` text NOT NULL,
  `category` text NOT NULL,
  `properties` text,
  `timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `analytics_events_user_id_idx` ON `analytics_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `analytics_events_event_idx` ON `analytics_events` (`event`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `analytics_events_category_idx` ON `analytics_events` (`category`);
