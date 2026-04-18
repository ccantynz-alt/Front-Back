-- BLK-009 Deploy Pipeline Backend
-- Adds the Vercel-equivalent push-to-deploy columns to `deployments` and
-- introduces the `deployment_logs` table for line-by-line build output.
-- Additive only: nothing is dropped or renamed. Existing `deployments`
-- rows keep their original `created_at` / `finished_at` / `duration` / `url`
-- columns; the new columns augment them.

ALTER TABLE `deployments` ADD COLUMN `commit_author` text;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `deploy_url` text;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `build_duration` integer;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `error_message` text;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `triggered_by` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `started_at` integer;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `completed_at` integer;
--> statement-breakpoint
ALTER TABLE `deployments` ADD COLUMN `cancel_requested_at` integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `deployment_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `deployment_id` text NOT NULL,
  `stream` text DEFAULT 'stdout' NOT NULL,
  `line` text NOT NULL,
  `timestamp` integer NOT NULL,
  FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deployment_logs_deployment_id_idx` ON `deployment_logs` (`deployment_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deployment_logs_timestamp_idx` ON `deployment_logs` (`timestamp`);
