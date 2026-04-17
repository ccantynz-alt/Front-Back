-- Gluecron push-notification receiver (Finding 1).
-- Maps `owner/name` git repositories to the tenant deploy configuration the
-- /api/hooks/gluecron/push endpoint should invoke. Additive: nothing else
-- is altered or dropped.

CREATE TABLE IF NOT EXISTS `tenant_git_repos` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `repository` text NOT NULL,
  `app_name` text NOT NULL,
  `branch` text DEFAULT 'main' NOT NULL,
  `domain` text NOT NULL,
  `port` integer NOT NULL,
  `runtime` text NOT NULL,
  `env_vars` text,
  `auto_deploy` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tenant_git_repos_repository_unique` ON `tenant_git_repos` (`repository`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tenant_git_repos_tenant_idx` ON `tenant_git_repos` (`tenant_id`);
