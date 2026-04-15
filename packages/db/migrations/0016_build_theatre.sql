-- BLK-019 Build Theatre — Vercel-style live visibility for every
-- long-running platform operation (deploys, ingests, migrations, CI
-- gates, voice-dispatched AI agents, sentinel runs).

CREATE TABLE IF NOT EXISTS `build_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `actor_user_id` text,
  `actor_label` text,
  `git_branch` text,
  `git_sha` text,
  `metadata` text,
  `error` text,
  `cancel_requested_at` integer,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_runs_started_at_idx` ON `build_runs` (`started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_runs_kind_status_idx` ON `build_runs` (`kind`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_runs_actor_idx` ON `build_runs` (`actor_user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `build_steps` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `seq` integer NOT NULL,
  `name` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `exit_code` integer,
  `error` text,
  `started_at` integer,
  `ended_at` integer,
  FOREIGN KEY (`run_id`) REFERENCES `build_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_steps_run_seq_idx` ON `build_steps` (`run_id`,`seq`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `build_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `step_id` text,
  `seq` integer NOT NULL,
  `stream` text DEFAULT 'stdout' NOT NULL,
  `line` text NOT NULL,
  `timestamp` integer NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `build_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`step_id`) REFERENCES `build_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_logs_run_seq_idx` ON `build_logs` (`run_id`,`seq`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_logs_step_idx` ON `build_logs` (`step_id`);
