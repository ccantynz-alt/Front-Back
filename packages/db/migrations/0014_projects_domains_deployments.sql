CREATE TABLE IF NOT EXISTS `projects` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `description` text,
  `repo_url` text,
  `repo_branch` text DEFAULT 'main',
  `framework` text,
  `build_command` text,
  `output_dir` text,
  `install_command` text DEFAULT 'bun install',
  `runtime` text DEFAULT 'bun',
  `port` integer DEFAULT 3000,
  `status` text DEFAULT 'creating' NOT NULL,
  `last_deployed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `projects_slug_idx` ON `projects` (`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_user_id_idx` ON `projects` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_status_idx` ON `projects` (`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_domains` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `domain` text NOT NULL,
  `is_primary` integer DEFAULT false NOT NULL,
  `dns_verified` integer DEFAULT false NOT NULL,
  `dns_verified_at` integer,
  `tls_provisioned` integer DEFAULT false NOT NULL,
  `tls_provisioned_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `project_domains_domain_idx` ON `project_domains` (`domain`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_domains_project_id_idx` ON `project_domains` (`project_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_env_vars` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `key` text NOT NULL,
  `encrypted_value` text NOT NULL,
  `environment` text DEFAULT 'production' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_env_vars_project_id_idx` ON `project_env_vars` (`project_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `deployments` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `user_id` text NOT NULL,
  `commit_sha` text,
  `commit_message` text,
  `branch` text DEFAULT 'main',
  `status` text DEFAULT 'queued' NOT NULL,
  `build_log` text,
  `container_id` text,
  `container_image` text,
  `url` text,
  `duration` integer,
  `is_current` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL,
  `finished_at` integer,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deployments_project_id_idx` ON `deployments` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deployments_status_idx` ON `deployments` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deployments_is_current_idx` ON `deployments` (`is_current`);
