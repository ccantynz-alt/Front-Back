CREATE TABLE IF NOT EXISTS `tenant_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `neon_project_id` text NOT NULL,
  `connection_uri` text NOT NULL,
  `region` text DEFAULT 'aws-us-east-2' NOT NULL,
  `status` text NOT NULL,
  `plan` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tenant_projects_neon_project_id_unique` ON `tenant_projects` (`neon_project_id`);
