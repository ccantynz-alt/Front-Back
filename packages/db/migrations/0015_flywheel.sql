-- BLK-017 Flywheel Memory + BLK-018 Voice dispatch log
-- Every Claude Code session on this repo persists here so future
-- sessions can retrieve what was already learned. Source of truth is
-- ~/.claude/projects/**/*.jsonl — ingested by packages/flywheel.

CREATE TABLE IF NOT EXISTS `flywheel_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `cwd` text,
  `git_branch` text,
  `entrypoint` text,
  `version` text,
  `first_user_message` text,
  `turn_count` integer DEFAULT 0 NOT NULL,
  `compact_count` integer DEFAULT 0 NOT NULL,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  `summary` text,
  `ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_sessions_started_at_idx` ON `flywheel_sessions` (`started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_sessions_git_branch_idx` ON `flywheel_sessions` (`git_branch`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `flywheel_turns` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `seq` integer NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `tool_name` text,
  `parent_uuid` text,
  `timestamp` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `flywheel_sessions`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_turns_session_seq_idx` ON `flywheel_turns` (`session_id`, `seq`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_turns_role_idx` ON `flywheel_turns` (`role`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `flywheel_lessons` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text,
  `category` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `tags` text,
  `source_refs` text,
  `confidence` integer DEFAULT 50 NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `flywheel_sessions`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_lessons_category_idx` ON `flywheel_lessons` (`category`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_lessons_created_at_idx` ON `flywheel_lessons` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `flywheel_keystrokes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `session_id` text,
  `file_path` text,
  `event_type` text NOT NULL,
  `content_delta` text,
  `metadata` text,
  `timestamp` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_keystrokes_user_time_idx` ON `flywheel_keystrokes` (`user_id`, `timestamp`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_keystrokes_session_idx` ON `flywheel_keystrokes` (`session_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `flywheel_voice_commands` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `transcript` text NOT NULL,
  `intent` text,
  `action` text,
  `response` text,
  `confidence` integer,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_voice_user_time_idx` ON `flywheel_voice_commands` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_voice_status_idx` ON `flywheel_voice_commands` (`status`);
